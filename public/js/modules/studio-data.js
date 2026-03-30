var ytApiKey = localStorage.getItem('yt_api_key') || '';
var ytResults = [];
var audioCtx = null;
var fxGain = null;
var fxConvolver = null;
var fxDelay = null;
var fxDelayGain = null;
var fxEqLow = null;
var fxEqHigh = null;
var fxSource = null;
var fxConvolverBuffer = null;

const _artLetras = [
  { id: 1, titulo: 'Jefita Entienda', tema: 'Familia / TDHA', fuente: 'OneNote', letra: 'Mire jefita yo no soy\nel culpable De esos detalles\nPues en la escuela el profe no me pone\nAtencion siempre me ignora con devocion como si no le hablara nadie\nyo creo que no me quiere dar educacion\nPero jefita no me pegue porfavor\nyo le estoy diciendo la verdad\nno se si al profe yo le caiga mal\nLe juro que me he intentado comportar\nPero me ganan mis ancias de verdad\nPor eso suelo caminar o me pongo platicar\nO sino me empiezo a sentir mal\nY tampoco hasta enfrente me dejan sentar\ny al pizarron no suelo alcanzar a mirar\npues siempre me dejan sentado hasta atras\nsegun esto por mi comportamiento singular\nEn ese tiempo no sabian que existian el TDHA ni la HIPERACTIVIDAD\n\nPero si sere invencible\nVoy a venir a callar\na todos esos incensibles\nque me decian "tu no sirves"\n\nJefita mucho tiempo he estado ocultando mis sentimientos por hacer el intento\nDe ser alguien "normal"\nPara ser el hijo que tu tanto anelabas y entraniabas\nPor eso yo lloraba todas esas madrugadas\nPor no poder darle a mi madre todo lo que de mi esperaba\nFue cuando empece a Usar sustancias nosibas para mi salud\npero tambien que robaron parte de mi juventud\n\nPara no sentir esta pena tan amarga cada madrugada\nque le doy una jalada al porro con lentitud\nEsta va a su salud\nPorque ya estoy en mi plenitud\nPero les doy gracias por sus criticas\nme han llevado al camino que ahora estoy\nMetiendole un chingo carinyo\nA todas las palabras que yo rimo\nCon pacion art se las dice con amor\n\nArt' },
  { id: 2, titulo: 'Mira Tus Alrededores Veras', tema: 'Sociedad / Critica', fuente: 'OneNote', letra: 'Mira tus alrededores veras\nA los perdedores\nA los que se inventan sus rumores\nAquellos que solo son consumidores\nDe personajes con millones de seguidores\nPero vacios en sus emociones\nAquellos que Son falsos en todas sus producciones\nLos que fingen un falso amor solo\nPara producir millones\nPeros les faltan eones\nPara que puedan entender\nLo que a este mundo venimos a hacer\nY muchos en los anyos han pensado\nque pueda ser aquello que todos siguen buscando\nPero no van a poder\nPues es algo tan sutil que cuando lo tienen\nNo lo tardaran en perder\nPero yace en cada uno y en su propio ser\nPara unos es amor para otros es poder envejecer\ny compartir todo lo que han vivido con todos sus seres queridos\nPero ellos asi lo han Decidido\nComo para otros es la droga y el vino\nPero para que te hago reconocer los errores humanos\nsi los humanos somos los mismos que seguimos pagando' },
  { id: 3, titulo: 'Como Es Cruel Esta Vida', tema: 'Calle / Realidad', fuente: 'OneNote', letra: 'Como es cruel esta vida\nPues se llevado a varios compas por estar en la movida\nCompas que he conocido pero que por menos de un puto gramo me han vendido\nA varios de esos he conocido\nEsos que les das la mano y...' },
  { id: 4, titulo: 'Mirame', tema: 'Desamor / Idealizacion', fuente: 'OneNote', letra: '(coro)\nY esque Mirame mirame\nSolo mirame\nQuiero verte a los ojos\nSolo mirame\n\nNo se que ha pasado\nNi como sucedio\nPero Por favor\nYa dame una explicacion\nIntenta hacerlo sin danyar tanto\nA mi corazon\n\nYo me culpo\nPor haberte idializado\nPor haber pensado\nQue tu eras la chica perfecta\nPero no tuve en cuenta\nQue tu no eras tan recta\nPero Tu ya sabias la receta\npara repartir amor\nPero no fuiste concreta\nSolo me causaste mas dolor\nNo tuviste mas valor\nDejaste a mi vida Sin color\n\nPor ti yo hacia\ntodo lo que me pedias\nTambien te complacia\nCon toda clase de tonterias\nPensaba que asi cederias\nPero puras fantacias\nYa algo me decia\nQue tu me mentias\n\nPero yo seguia\nMuy ilucionado y muy enamorado\nEstaba cegado\nTe lo digo con dolor\nPensaba que contigo\nHabia encontrado\nUn verdadero amor\nPero no\nNo.. noo.. noooooo....\n\nPor eso mirame mirame\nSolo mirame\nQuiero verte a los ojos\nSolo mirame' },
  { id: 5, titulo: 'Gracias A Ustedes', tema: 'Superacion / Gratitud', fuente: 'OneNote', letra: 'Gracias a ustedes yo he aprendido\nLa experiencia es lo que he adquirido\nGracias por todo lo vivido\nSe los dice este bato enloquecido\nLE agradezco a todos\ncon los que he crecido\nMe pongo a pensar\nY aunque no se\nPorque he renacido\nde este mundo enloquecido\nVoy superando cada dia a mi pasado\nVoy eligiendo caminos para poder llegar a mi destino\nPorque uno es el va haciendo su propio camino\nPor eso he elegido\nMi talento consentido\nEste talento con el que tanto\nTiempo llevo invertido' },
  { id: 6, titulo: 'En Esa Vida Nacemos Credulos', tema: 'Reflexion', fuente: 'OneNote', letra: 'En esa vida nacemos credulos\n\nMi deprecion no me domina\ndia dia Lo voy superando cada vez que lo hago...' },
  { id: 7, titulo: 'Quiero Contarle A La Gente', tema: 'Familia / Abuela', fuente: 'OneNote', letra: 'Quiero contarle a la gente\ntodas tus experiencias\nde todas tus vivencias\nDe lo que has pasado\nTodo lo que has madurado\na su lado\nsin percatarse que el tiempo ha pasado\nPor eso quiero dejarte viva con todas tus anecdotas\ndonde has echo tu mundo inmaculado\ny que tu estas apunto de irte de mi lado\npor eso quiero plasmarlo\nPara dejarlo bien claro\nGracias mama Juana por dejarme\nEvidenciar lo que en tu vida ha pasado\nPor si no lo han notado\nes tu nieta una de las que mas te ha amado' },
  { id: 8, titulo: 'Letra Tipo Corrido', tema: 'Desamor / Traicion', fuente: 'OneNote', letra: 'Te lo agradezco de antemano\nTu me has dado el mejor regalo\neso no puedo negarlo\nes lo mejor que me ha pasado\nTu bien sabes que es de lo que yo te hablo\n\nPero Lo Lamento lo nuestro ya es pasado\nTu forma de tratarme y El tiempo de eso se han encargado\nTambien mi memoria a intentado olvidarse\nde los mejores momentos a tu lado\n\nNo lo niego fui feliz por un tiempo no te miento\nya sabia de todos tus sentimientos\nY de Cada vez que tu llorabas le pedias\nsolo palabras vacias al viento\nYo veia todo tu sufrimiento\nValla que dolia el momento\nyo te seguia en tu lamento\nY esque quien se queda contento\nCuando ve que este supuesto amor\nBusca cualquier pretexto\nPara tener otro encuentro\n\nPero Mira que antes de esto\nyo nunca te avia fallado\npero en la carrera de la traicion\nTu primero habias empezado\n\nSolo que yo si te habia perdonado\nAun asi que tu lo tuvieras bien planeado\nPara poder volver a mi lado\n\nyo tuve que aceptarlo meses esperando\nDonde te estuve rogado\nQue volvieras a mi lado\nsolo me la pasaba llorando y suplicando\nfue cuando la vida me dio un golpe\nDe realidad Vi la claridad\nPorque yo vivia en una fantasia que Realmente no existia\nFue donde me di cuenta que\nel amor que yo sentia era de mentira' },
  { id: 9, titulo: 'Me Hago El Valiente', tema: 'Desamor / Valentia', fuente: 'Google Photos', letra: 'Me hago el valiente ella me ve de frente\nRecuerdo el presente soy mas elocuente\nAunque lo cuente quien lo cuente\nNo importa el pasado ya esta acabado' },
  { id: 10, titulo: 'Claro Que Se Acabo', tema: 'Desamor / Familia (hija)', fuente: 'Google Photos', letra: 'Claro que se acabo\ntodo termino\nlo que nos mantenia unidos se fue\nrompiendo sin dejar ningun residuo\nFallas gritos decepciones\nsiempre fue lo mismo\nme aferre a mi egoismo\nde seguir donde ya habia un abismo\nNo me encontraba conmigo mismo\nTodo se volvio un maldito espejismo\n\nsigo solo contra todos mis demonios\nno se ni como pude salir pa delante\nlo unico que me motiva es ver esa\nsonrisita de mi ninya\nes la que me alegra todo dia\npor eso sigo con valentia\nsin ella no se donde yo estaria\nEs lo unico bueno que a los dos nos\npasaria dentro de nuestra relacion\nPues todo lo demas se acabo\n\nbesos caricias y abrazos ya quedaron en el pasado\nAhora solo es ignorarnos olvidarnos\nHacer como que no paso\naunque la neta yo todavia te extranyo' },
  { id: 11, titulo: 'Perro (Sin titulo oficial)', tema: 'Desamor crudo / Traicion', fuente: 'Archivo local', letra: 'Sigo sintiendo y es que la verdad por ti estoy muriendo\neste sentimiento ya no lo quito con nada\ny eso que lo he tratado de borrar durante varias madrugadas\ny no ha resultado nada\n\nMientras mas embrutecido por todo lo que he fumado y he bebido\nmejor me he sentido\ny es que yo a ti no te encuentro sentido\nde como te has permitido caer tan bajo sin motivo\nSi todo lo tenias conmigo\n\nYa quiero olvidarme de ti\ny de todo el tiempo que te di\nbastante ya perdi\nPor intentar hacerte feliz\n\nNo me rueges que me quede si tu ni siquiera realmente me quieres\nsolo lo haces pa mantener la facha\ny seguir fumando de mi bacha\n\nNo caere de nuevo en tu juego\nsolo me quieres pa conseguirte de lo mas caro de lo mas bueno\npero conmigo realmente no quieres compartir tu amor ni tu tiempo\n\nPa que nos hacemos tontos\ntu a mi me enganyas con otro\nme dejaste el cora todo roto\n\npa que me dejas vivo?\nsolo y sin ningun motivo para seguir sufriendo\nPor un amor que me olvido\n\nPero ya entendi comprendi que tu no eres para mi\ny que yo solo era un chiste para ti\nque tu con otro ya eras feliz\nmientras te escondias de mi' }
];

window.__artLetrasData = _artLetras;
window.__artLetrasReady = true;

const _sunoTracks = [
  { titulo: 'SENTIDO PERDIDO', genero: 'Rap, R&B', tema: 'Desamor / Identidad', plays: 3, nota: 'Letra 100% original ArT-AtR. Intro hablado.' },
  { titulo: 'LA BACHA [A-R-T-A-T-R]', genero: 'Melodic Trap, Heavy 808', tema: 'Desamor crudo', plays: 20, nota: 'Version musicalizada de Perro.' },
  { titulo: 'SIGO SINTIENDO reggaeton', genero: 'Reggaeton Trap', tema: 'Desamor', plays: 14, nota: 'Version reggaeton de Perro.' },
  { titulo: 'VOZ. "El Alma" (Tributo a Mama)', genero: 'Acoustic reggae rap, lo-fi boom bap', tema: 'Familia / Tributo', plays: 14, nota: '4+ versiones.' },
  { titulo: 'alejarme de ti', genero: 'Electronic, soft piano, synths', tema: 'Desamor / Despedida', plays: 7 },
  { titulo: 'Mama!', genero: 'Reggae, male vocals, rap', tema: 'Familia / Tributo', plays: 3 },
  { titulo: 'MIC-TLAMPA (Huesos de Ceniza)', genero: 'Death-Trap / Ancestral Metal', tema: 'TEC-PATL', plays: 3, nota: 'BPM 155' },
  { titulo: 'NAHUI OLLIN (Eje de Movimiento)', genero: 'Cyber-Tribal / Industrial Grime', tema: 'TEC-PATL', plays: 6, nota: 'BPM 140' },
  { titulo: 'TEZCATLIPOCA (El Espejo Humea)', genero: 'Trap Metal / Deathcore / Ancestral', tema: 'TEC-PATL', plays: 6, nota: 'BPM 160' },
  { titulo: 'YANCUIC TONATIUH (El Nuevo Sol)', genero: 'Ancestral Drill / Deep Bass', tema: 'TEC-PATL', plays: 5, nota: 'BPM 142' },
  { titulo: 'ITZTLI (Obsidiana)', genero: 'Ethno-Trap / Dark Ambient', tema: 'TEC-PATL', plays: 14, nota: 'BPM 130. Remastered.' },
  { titulo: 'EL TABLERO DE JUDAS', genero: 'Dark Trap / Orchestral Drill', tema: 'TEC-PATL', plays: 7, nota: 'BPM 140. 4 versiones.' },
  { titulo: 'GRAVEDAD Y CRISTAL', genero: '(no styles)', tema: 'Codigo', plays: 5 },
  { titulo: 'LEGADO EN EL CODIGO', genero: '(no styles)', tema: 'Codigo', plays: 5 },
  { titulo: 'PERSISTENCIA DE UN BANDIDO', genero: '(no styles)', tema: 'Codigo', plays: 4 },
  { titulo: 'CODIGO DE SANGRE (The ArT-AtR)', genero: '(no styles)', tema: 'Codigo', plays: 6 },
  { titulo: 'INDEXADO (Meta-ArT)', genero: '(no styles)', tema: 'Codigo', plays: 3 },
  { titulo: 'PERSISTENCIA (LocalForage)', genero: '(no styles)', tema: 'Codigo', plays: 4 },
  { titulo: 'byflowcell', genero: 'Melodic Trap / Sad R&B', tema: 'ByFlow', plays: 0 },
  { titulo: 'The Byflow Trinity4', genero: 'Dark Trap, raspy melodic vocals', tema: 'ByFlow', plays: 0 },
  { titulo: 'The Byflow Trinity3', genero: 'Spanish Trap, sad boy, malianteo', tema: 'ByFlow', plays: 0 },
  { titulo: 'EXP-COMPLETE (Remastered)', genero: 'Dark Lo-Fi Trip-Hop', tema: 'EXP', plays: 4 },
  { titulo: 'EXPLatencia Cero', genero: 'Chrono-Trap, Metal Industrial', tema: 'EXP', plays: 4 },
  { titulo: 'EXP', genero: 'Cyber-Doom Trap', tema: 'EXP', plays: 5 },
  { titulo: 'TOMA 2', genero: 'Glitch-Trap, Deathcore, aggressive rap', tema: 'Experimental', plays: 5, nota: 'BPM 140. 6 versiones.' },
  { titulo: 'Luz de Grabacion', genero: 'Neo-Soul, Lo-Fi R&B', tema: 'Experimental', plays: 3 },
  { titulo: 'Madre_Mia', genero: 'Cover', tema: 'Familia', plays: 0 },
  { titulo: '[META: ART-URO CORE - FENIX CODE]', genero: 'K-pop, trap rap, Mexican style', tema: 'Meta', plays: 4 },
  { titulo: 'Esta soledad', genero: 'Cover', tema: 'Desamor', plays: 16 },
  { titulo: 'Uno+Suno=rock', genero: 'Rock', tema: 'Experimental', plays: 32 }
];

(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const studioData = VF.modules.studioData = {};

  function expose(name, value) {
    studioData[name] = value;
    window[name] = value;
  }

  function delegate(resolve) {
    return function delegated() {
      const fn = resolve();
      return fn.apply(this, arguments);
    };
  }

  function updateClock() {
    const el = document.getElementById('datetime');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }

  expose('lsRenderMisLetras', delegate(() => VF.modules.studio.lsRenderMisLetras));
  expose('lsFilterMisLetras', delegate(() => VF.modules.studio.lsFilterMisLetras));
  expose('lsShowLetra', delegate(() => VF.modules.studio.lsShowLetra));
  expose('lsLoadLetraToTp', delegate(() => VF.modules.studio.lsLoadLetraToTp));
  expose('lsCopyCurrentLetra', delegate(() => VF.modules.studio.lsCopyCurrentLetra));
  expose('lsRenderSuno', delegate(() => VF.modules.studio.lsRenderSuno));
  expose('lsFilterSuno', delegate(() => VF.modules.studio.lsFilterSuno));
  expose('generateOfflineLyrics', delegate(() => VF.modules.studio.generateOfflineLyrics));
  expose('generateGrokLyrics', delegate(() => VF.modules.studio.generateGrokLyrics));
  expose('_updateGrokLyricBtn', delegate(() => VF.modules.studio._updateGrokLyricBtn));
  expose('lsLoadToTeleprompter', delegate(() => VF.modules.studio.lsLoadToTeleprompter));
  expose('lsCopyLyrics', delegate(() => VF.modules.studio.lsCopyLyrics));
  expose('ytInit', delegate(() => VF.modules.youtube.ytInit));
  expose('ytSaveKey', delegate(() => VF.modules.youtube.ytSaveKey));
  expose('ytParseDuration', delegate(() => VF.modules.youtube.ytParseDuration));
  expose('ytCacheGet', delegate(() => VF.modules.youtube.ytCacheGet));
  expose('ytCacheSet', delegate(() => VF.modules.youtube.ytCacheSet));
  expose('ytFreeSearch', delegate(() => VF.modules.youtube.ytFreeSearch));
  expose('ytSearch', delegate(() => VF.modules.youtube.ytSearch));
  expose('ytRenderResults', delegate(() => VF.modules.youtube.ytRenderResults));
  expose('switchMusicSource', delegate(() => VF.modules.youtube.switchMusicSource));
  expose('ytPlayWithLyrics', delegate(() => VF.modules.youtube.ytPlayWithLyrics));
  expose('generateLRCWithGrok', delegate(() => VF.modules.youtube.generateLRCWithGrok));
  expose('grokWriteLyrics', delegate(() => VF.modules.youtube.grokWriteLyrics));
  expose('generateLRCManual', delegate(() => VF.modules.youtube.generateLRCManual));
  expose('ytEmbed', delegate(() => VF.modules.youtube.ytEmbed));
  expose('scEmbed', delegate(() => VF.modules.youtube.scEmbed));
  expose('closeEmbed', delegate(() => VF.modules.youtube.closeEmbed));
  expose('scSearch', delegate(() => VF.modules.youtube.scSearch));
  expose('scPlayUrl', delegate(() => VF.modules.youtube.scPlayUrl));
  expose('jmSearch', delegate(() => VF.modules.youtube.jmSearch));
  expose('jmSaveKey', delegate(() => VF.modules.youtube.jmSaveKey));
  expose('jmPlay', delegate(() => VF.modules.youtube.jmPlay));
  expose('initAudioFX', delegate(() => VF.modules.player.initAudioFX));
  expose('connectAudioToFX', delegate(() => VF.modules.player.connectAudioToFX));
  expose('initFXSliders', delegate(() => VF.modules.player.initFXSliders));
  expose('initVisualizer', delegate(() => VF.modules.player.initVisualizer));
  expose('updateClock', updateClock);
})(window.VibeFlow = window.VibeFlow || {});
