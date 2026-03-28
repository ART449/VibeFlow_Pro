/**
 * ByFlow POS — Socket.IO Real-time Sync
 * Multi-device synchronization for POS terminals
 */

const { validateToken } = require('./auth');

function registerPOSSockets(io) {
  const posNamespace = io.of('/pos');

  // AUTH MIDDLEWARE for Socket.IO — validate token before allowing connection
  posNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Token requerido para conectar al POS'));
    }
    const session = validateToken(token);
    if (!session) {
      return next(new Error('Token invalido o expirado'));
    }
    // Attach verified session — NOT from client claims
    socket.posSession = session;
    next();
  });

  posNamespace.on('connection', (socket) => {
    console.log(`[POS] Device connected: ${socket.id} (${socket.posSession.role})`);

    // ═══ JOIN ROOMS ═══
    // Each device joins rooms based on its role
    socket.on('pos:join', ({ barId }) => {
      // Use SERVER-VERIFIED session data, NOT client claims
      const role = socket.posSession.role;
      const employeeId = socket.posSession.employeeId;
      const barRoom = `bar_${barId || 'default'}`;
      socket.join(barRoom);
      socket.employeeId = employeeId;
      socket.role = role;
      socket.barRoom = barRoom;

      // Role-specific rooms
      if (['cocinero'].includes(role)) socket.join(`${barRoom}_kitchen`);
      if (['bartender'].includes(role)) socket.join(`${barRoom}_bar`);
      if (['dj'].includes(role)) socket.join(`${barRoom}_karaoke`);
      if (['seguridad'].includes(role)) socket.join(`${barRoom}_entrance`);
      if (['dueno', 'gerente', 'capitan'].includes(role)) {
        socket.join(`${barRoom}_kitchen`);
        socket.join(`${barRoom}_bar`);
        socket.join(`${barRoom}_karaoke`);
        socket.join(`${barRoom}_entrance`);
      }

      console.log(`[POS] ${role} (emp #${employeeId}) joined ${barRoom}`);

      // Notify others
      socket.to(barRoom).emit('pos:device-joined', {
        role, employeeId, timestamp: new Date().toISOString()
      });
    });

    // ═══ TABLE EVENTS ═══
    socket.on('pos:table-update', (data) => {
      // Broadcast table status change to all devices in the bar
      socket.to(socket.barRoom).emit('pos:table-updated', {
        ...data, timestamp: new Date().toISOString()
      });
    });

    // ═══ ORDER EVENTS ═══
    socket.on('pos:order-new', (data) => {
      const room = socket.barRoom;
      socket.to(room).emit('pos:order-created', data);
    });

    socket.on('pos:order-item-add', (data) => {
      const room = socket.barRoom;
      socket.to(room).emit('pos:order-item-added', data);
    });

    socket.on('pos:order-send', (data) => {
      const room = socket.barRoom;
      // Notify kitchen and bar
      socket.to(`${room}_kitchen`).emit('pos:kitchen-new-order', {
        ...data, timestamp: new Date().toISOString()
      });
      socket.to(`${room}_bar`).emit('pos:bar-new-order', {
        ...data, timestamp: new Date().toISOString()
      });
      // Notify all POS terminals
      socket.to(room).emit('pos:order-sent', data);
    });

    // ═══ KITCHEN EVENTS ═══
    socket.on('pos:kitchen-ready', (data) => {
      const room = socket.barRoom;
      // Notify the waiter's device
      socket.to(room).emit('pos:order-ready', {
        ...data, timestamp: new Date().toISOString()
      });
    });

    socket.on('pos:kitchen-progress', (data) => {
      socket.to(socket.barRoom).emit('pos:order-in-progress', data);
    });

    // ═══ PAYMENT EVENTS ═══
    socket.on('pos:payment-complete', (data) => {
      const room = socket.barRoom;
      // Table freed - update all maps
      socket.to(room).emit('pos:table-freed', {
        ...data, timestamp: new Date().toISOString()
      });
    });

    // ═══ KARAOKE EVENTS ═══
    socket.on('pos:karaoke-add', (data) => {
      const room = socket.barRoom;
      socket.to(`${room}_karaoke`).emit('pos:karaoke-song-added', data);
      socket.to(room).emit('pos:karaoke-updated', data);
    });

    socket.on('pos:karaoke-next', (data) => {
      const room = socket.barRoom;
      posNamespace.to(room).emit('pos:karaoke-now-playing', data);
    });

    // ═══ COVER EVENTS ═══
    socket.on('pos:cover-entry', (data) => {
      const room = socket.barRoom;
      socket.to(room).emit('pos:cover-registered', {
        ...data, timestamp: new Date().toISOString()
      });
    });

    // ═══ HAPPY HOUR ═══
    socket.on('pos:happy-hour-toggle', (data) => {
      posNamespace.to(socket.barRoom).emit('pos:happy-hour-changed', data);
    });

    // ═══ NOTIFICATIONS ═══
    socket.on('pos:notify', (data) => {
      // Send notification to specific role or all
      const { target, message, type } = data;
      if (target === 'all') {
        socket.to(socket.barRoom).emit('pos:notification', { message, type });
      } else {
        socket.to(`${socket.barRoom}_${target}`).emit('pos:notification', { message, type });
      }
    });

    // ═══ DISCONNECT ═══
    socket.on('disconnect', () => {
      if (socket.barRoom) {
        socket.to(socket.barRoom).emit('pos:device-left', {
          role: socket.role, employeeId: socket.employeeId
        });
      }
      console.log(`[POS] Device disconnected: ${socket.id}`);
    });
  });

  console.log('[POS] Socket.IO namespace /pos registered');
}

module.exports = { registerPOSSockets };
