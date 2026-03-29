// ── Billing (Stripe) — routes/billing.js ────────────────────────────────────
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SUBS_FILE = path.join(__dirname, '..', 'data', 'subscriptions.json');

function readSubs() {
  try { return fs.existsSync(SUBS_FILE) ? JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) : { users: {} }; }
  catch { return { users: {} }; }
}
function writeSubs(data) {
  try { fs.writeFileSync(SUBS_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch(e) { console.error('[Stripe] Write error:', e.message); }
}
function planFromPrice(priceId) {
  if (priceId === process.env.STRIPE_PRICE_PRO_CREATOR) return 'PRO_CREATOR';
  if (priceId === process.env.STRIPE_PRICE_PRO_BAR) return 'PRO_BAR';
  return 'FREE';
}
function featuresForPlan(plan) {
  switch (plan) {
    case 'PRO_CREATOR': return { karaoke:true, musica:true, bares:false, ia:true, remoteQR:true };
    case 'PRO_BAR':     return { karaoke:true, musica:true, bares:true, ia:true, remoteQR:true };
    default:            return { karaoke:true, musica:false, bares:false, ia:false, remoteQR:false };
  }
}

// License key generation (duplicated from license.js for webhook independence)
function generateLicenseKey(LICENSE_SECRET) {
  const payload = crypto.randomBytes(8).toString('hex').toUpperCase();
  const sig = crypto.createHmac('sha256', LICENSE_SECRET)
    .update(payload).digest('hex').slice(0, 4).toUpperCase();
  const raw = payload + sig;
  return `VFP-${raw.slice(0,5)}-${raw.slice(5,10)}-${raw.slice(10,15)}-${raw.slice(15,20)}`;
}
function validateKeySignature(key, LICENSE_SECRET) {
  const clean = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 23 || !key.startsWith('VFP-')) return false;
  const raw = clean.slice(3);
  const payload = raw.slice(0, 16);
  const sig = raw.slice(16, 20);
  const expected = crypto.createHmac('sha256', LICENSE_SECRET)
    .update(payload).digest('hex').slice(0, 4).toUpperCase();
  return sig === expected;
}

// Register the Stripe webhook BEFORE express.json (needs raw body)
function registerWebhook(app, helpers) {
  const { LICENSE_SECRET } = helpers;
  const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;

  app.post('/api/stripe/webhook', require('express').raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(200).send('Stripe no configurado');
    const sig = req.headers['stripe-signature'];
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET); }
    catch (err) { console.error('[Stripe] Webhook sig error:', err.message); return res.status(400).send('Bad sig'); }
    const subs = readSubs();
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object;
          const email = s.customer_details?.email || s.metadata?.email;
          const plan = s.metadata?.plan || 'PRO_BAR';
          if (email && s.subscription && s.customer) {
            subs.users[email] = { ...(subs.users[email]||{}), stripeCustomerId:s.customer, stripeSubscriptionId:s.subscription, status:'active', plan, updatedAt:new Date().toISOString() };
            if (plan === 'PRO_BAR' || plan === 'POS_STARTER' || plan === 'POS_PRO' || plan === 'POS_VITALICIO') {
              const licenseKey = generateLicenseKey(LICENSE_SECRET);
              const licenseEntry = {
                key: licenseKey, plan, email, type: 'pos',
                activated: true, activatedAt: new Date().toISOString(),
                stripeCustomerId: s.customer, stripeSubscriptionId: s.subscription
              };
              if (!subs.posLicenses) subs.posLicenses = {};
              subs.posLicenses[email] = licenseEntry;
              subs.users[email].posLicenseKey = licenseKey;
              subs.users[email].posActive = true;
              console.log('[Stripe] POS license auto-generated for', email, ':', licenseKey);
            }
            writeSubs(subs);
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const price = sub.items?.data?.[0]?.price?.id;
          const plan = planFromPrice(price);
          try {
            const cust = await stripe.customers.retrieve(sub.customer);
            if (cust.email) {
              subs.users[cust.email] = { ...(subs.users[cust.email]||{}), plan, status:sub.status, stripeCustomerId:sub.customer, stripeSubscriptionId:sub.id, currentPeriodEnd:sub.current_period_end, updatedAt:new Date().toISOString() };
              writeSubs(subs);
            }
          } catch (custErr) {
            console.error('[Stripe] Error retrieving customer:', custErr.message);
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          for (const email of Object.keys(subs.users)) {
            if (subs.users[email].stripeSubscriptionId === sub.id) {
              subs.users[email] = { ...subs.users[email], plan:'FREE', status:'canceled', updatedAt:new Date().toISOString() };
            }
          }
          writeSubs(subs);
          break;
        }
      }
      res.json({ received: true });
    } catch (err) { console.error('[Stripe] Webhook error:', err); res.status(500).send('Error'); }
  });
}

// Register billing routes AFTER express.json
function registerRoutes(app, _state, helpers) {
  const { LICENSE_SECRET } = helpers;
  const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;

  app.post('/api/billing/checkout-session', async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Pagos no configurados todavia' });
    const { plan, email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requerido' });
    const priceMap = {
      'PRO_CREATOR': process.env.STRIPE_PRICE_PRO_CREATOR,
      'PRO_BAR': process.env.STRIPE_PRICE_PRO_BAR,
      'POS_STARTER': process.env.STRIPE_PRICE_POS_STARTER,
      'POS_PRO': process.env.STRIPE_PRICE_POS_PRO,
      'POS_VITALICIO': process.env.STRIPE_PRICE_POS_VITALICIO
    };
    const priceId = priceMap[plan] || null;
    if (!priceId) return res.status(400).json({ error: 'Plan invalido' });
    try {
      const isOneTime = plan === 'POS_VITALICIO';
      const session = await stripe.checkout.sessions.create({
        mode: isOneTime ? 'payment' : 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.APP_BASE_URL || 'https://byflowapp.up.railway.app'}/pos-demo.html?checkout=success&plan=${plan}`,
        cancel_url: `${process.env.APP_BASE_URL || 'https://byflowapp.up.railway.app'}/pos-demo.html?checkout=cancel`,
        customer_email: email,
        metadata: { plan, email }
      });
      res.json({ url: session.url });
    } catch (err) { console.error('[Stripe] Checkout error:', err.message); res.status(500).json({ error: 'Error al crear checkout' }); }
  });

  // POS License verification
  app.get('/api/pos/license', (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email.trim().slice(0, 200) : '';
    const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
    const subs = readSubs();

    if (email && subs.posLicenses && subs.posLicenses[email]) {
      const lic = subs.posLicenses[email];
      const user = subs.users?.[email] || {};
      const isActive = user.status === 'active' || lic.plan === 'POS_VITALICIO';
      return res.json({
        ok: true, active: isActive,
        plan: lic.plan, email,
        key: lic.key,
        activatedAt: lic.activatedAt
      });
    }

    if (key) {
      if (!validateKeySignature(key, LICENSE_SECRET)) return res.json({ ok: false, error: 'Licencia invalida' });
      for (const [e, lic] of Object.entries(subs.posLicenses || {})) {
        if (lic.key === key) {
          const user = subs.users?.[e] || {};
          const isActive = user.status === 'active' || lic.plan === 'POS_VITALICIO';
          return res.json({ ok: true, active: isActive, plan: lic.plan, email: e, key });
        }
      }
    }

    res.json({ ok: false, error: 'No se encontro licencia POS para este email o clave' });
  });

  app.get('/api/billing/status', (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email.trim().slice(0, 200) : '';
    if (!email) return res.status(400).json({ error: 'Email requerido' });
    const subs = readSubs();
    if (!subs.users || typeof subs.users !== 'object') return res.json({ email, plan: 'FREE', status: 'inactive', features: featuresForPlan('FREE') });
    const user = Object.prototype.hasOwnProperty.call(subs.users, email) ? subs.users[email] : null;
    const plan = user?.plan || 'FREE';
    res.json({ email, plan, status: user?.status||'inactive', features: featuresForPlan(plan) });
  });

  app.post('/api/billing/customer-portal', async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Pagos no configurados todavia' });
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requerido' });
    const subs = readSubs();
    const user = subs.users[email];
    if (!user?.stripeCustomerId) return res.status(404).json({ error: 'Cliente no encontrado' });
    try {
      const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: process.env.APP_BASE_URL || 'https://byflowapp.up.railway.app' });
      res.json({ url: session.url });
    } catch (err) { console.error('[Stripe] Portal error:', err.message); res.status(500).json({ error: 'Error al abrir portal' }); }
  });
}

module.exports = { registerRoutes, registerWebhook };
