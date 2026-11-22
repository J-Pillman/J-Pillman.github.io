/* ===== 1. Reglas de detección (HU-011, 012, 013, 016, 017) ===== */
var ENTIDADES = /(banco|bcp|interbank|bbva|scotiabank|sunat|reniec|yape|plin)/i;
var DOMINIOS_OFICIALES = /(viabcp\.com|bcp\.com\.pe|interbank\.pe|bbva\.pe|scotiabank\.com\.pe|sunat\.gob\.pe|gob\.pe|yape\.com\.pe)$/i;

function neutralizar(url) {
    return url.replace(/\./g, '[.]');
}

function analizarTexto(texto) {
    var t = texto.trim();
    var senales = [];

    var enlaces = t.match(/(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?/gi) || [];

    if (/urgente|inmediat|último aviso|ultimo aviso|bloquea|suspend|hoy mismo|24 horas/i.test(t)) {
        senales.push('Intento de presión: te piden actuar de inmediato.');
    }
    if (/código|codigo|clave|contraseña|cvv|\bpin\b/i.test(t)) {
        senales.push('Te piden un código o una clave. Nunca los compartas.');
    }
    if (/yape|plin|transfer|deposit|envía.*(soles|dinero)|hazme un/i.test(t)) {
        senales.push('Petición urgente de dinero: llama al número conocido del familiar.');
    }
    if (/soy tu (hij|niet|familiar|sobrin)|cambié de número|nuevo número/i.test(t)) {
        senales.push('Alguien dice ser un familiar sin verificar su identidad.');
    }
    if (enlaces.some(function (e) { return /bit\.ly|t\.co|tinyurl|cutt\.ly|is\.gd/i.test(e); })) {
        senales.push('Enlace acortado: no ves la dirección real de destino.');
    }
    if (ENTIDADES.test(t) && enlaces.some(function (e) {
        var host = e.replace(/^https?:\/\//i, '').split('/')[0];
        return !DOMINIOS_OFICIALES.test(host) && !/bit\.ly|t\.co|tinyurl|cutt\.ly|is\.gd/i.test(host);
    })) {
        senales.push('Enlace de "banco" con una dirección que no es la oficial: ' + neutralizar(enlaces[0]) + ' (sin enlace clickeable).');
    }
    if (/[\w.-]+@(gmail|hotmail|outlook|yahoo)\.com/i.test(t) && ENTIDADES.test(t)) {
        senales.push('Una entidad no escribe desde un correo público (gmail, hotmail...).');
    }

    if (senales.length > 0) return { nivel: 'peligroso', senales: senales };
    if (t.length < 25 || t.split(/\s+/).length < 4) return { nivel: 'insuficiente', senales: [] };
    return { nivel: 'seguro', senales: [] };
}

function tieneDatoSensible(texto) {
    return /(\d[ -]?){16}/.test(texto);
}

/* ===== 2. Interfaz (solo si existe el documento) ===== */
if (typeof document !== 'undefined') {

    var $ = function (id) { return document.getElementById(id); };
    var ultimo = null;
    var modo = 'mensaje';

    /* --- Tamaño de texto A+ (HU-046): se conserva al navegar --- */
    var escalas = [1, 1.25, 1.5];
    var idxEscala = Number(sessionStorage.getItem('ds_escala') || 0);
    function aplicarEscala() {
        document.documentElement.style.setProperty('--escala', escalas[idxEscala]);
        $('btn-texto').textContent = idxEscala === 2 ? 'A−' : 'A+';
        sessionStorage.setItem('ds_escala', idxEscala);
    }
    $('btn-texto').addEventListener('click', function () {
        idxEscala = (idxEscala + 1) % escalas.length;
        aplicarEscala();
    });
    aplicarEscala();

    /* --- Selector de modalidad (HU-001, 002, 003) --- */
    document.querySelectorAll('.opcion').forEach(function (b) {
        b.addEventListener('click', function () {
            modo = b.dataset.modo;
            document.querySelectorAll('.opcion').forEach(function (o) {
                o.classList.toggle('activa', o === b);
                o.setAttribute('aria-pressed', o === b);
            });
            var llamada = modo === 'llamada';
            $('lbl-texto').textContent = llamada ? 'Describe la llamada' : 'Mensaje o enlace';
            $('texto').placeholder = llamada
                ? 'Cuenta qué te dijeron y qué te pidieron hacer.'
                : 'Pega aquí el mensaje completo. Los enlaces se muestran como texto, sin abrirlos.';
        });
    });

    /* --- Pegar texto y ayuda para copiar (HU-020) --- */
    function abrirAyudaCopiar(abrir) {
        $('panel-copiar').hidden = !abrir;
        $('btn-ayuda-copiar').setAttribute('aria-expanded', abrir);
    }
    $('btn-ayuda-copiar').addEventListener('click', function () { abrirAyudaCopiar($('panel-copiar').hidden); });
    $('btn-cerrar-copiar').addEventListener('click', function () { abrirAyudaCopiar(false); $('btn-ayuda-copiar').focus(); });
    $('btn-pegar').addEventListener('click', function () {
        if (!navigator.clipboard || !navigator.clipboard.readText) { abrirAyudaCopiar(true); return; }
        navigator.clipboard.readText().then(function (t) {
            $('texto').value = t.slice(0, 1500);
            $('texto').dispatchEvent(new Event('input'));
        }).catch(function () { abrirAyudaCopiar(true); });
    });

    /* --- Contador y botón Analizar activo solo con texto --- */
    $('texto').addEventListener('input', function () {
        var n = $('texto').value.length;
        $('contador').textContent = n + ' / 1500 caracteres';
        $('btn-analizar').disabled = $('texto').value.trim() === '';
    });

    /* --- Limpiar (HU-015) y analizar otro (HU-009) --- */
    function reiniciar() {
        $('texto').value = '';
        $('contador').textContent = '0 / 1500 caracteres';
        $('btn-analizar').disabled = true;
        $('msg-form').hidden = true;
        $('resultado').hidden = true;
        $('cargando').hidden = true;
        ultimo = null;
    }
    $('btn-limpiar').addEventListener('click', function () { reiniciar(); $('texto').focus(); });
    $('btn-otro').addEventListener('click', function () { reiniciar(); $('texto').focus(); });

    /* --- Envío del formulario: privacidad, conexión, análisis --- */
    $('form-verificar').addEventListener('submit', function (e) {
        e.preventDefault();
        var texto = $('texto').value;
        var aviso = $('msg-form');

        if (tieneDatoSensible(texto)) {                       // HU-018
            aviso.textContent = 'Nunca ingreses tus claves o tarjetas aquí. Se detectó una secuencia de 16 números. El contenido no fue analizado. Edita y borra el dato.';
            aviso.hidden = false;
            return;
        }
        if (!navigator.onLine) {                              // HU-019
            aviso.textContent = 'Parece que te quedaste sin señal de internet. Conservamos tu texto en esta pestaña; intenta de nuevo cuando vuelva la conexión.';
            aviso.hidden = false;
            return;
        }
        aviso.hidden = true;
        $('resultado').hidden = true;
        $('cargando').hidden = false;                         // HU-005

        setTimeout(function () {
            $('cargando').hidden = true;
            mostrarResultado(analizarTexto(texto), texto);
        }, 1200);
    });

    /* --- Resultado: veredicto, explicación y ayuda (HU-006, 007, 008, 023, 027) --- */
    function mostrarResultado(r, texto) {
        ultimo = { r: r, texto: texto };
        var textos = {
            peligroso: ['Esto es peligroso', '¡Cuidado! Detente un momento y pide ayuda. No respondas ni abras enlaces.'],
            seguro: ['Parece seguro', 'No vemos señales claras de engaño. Revisa quién lo envió antes de responder. Ninguna herramienta es infalible.'],
            insuficiente: ['Información insuficiente', 'No tenemos suficiente contexto. Pega el mensaje completo o explica qué te pidieron hacer. No se muestra como seguro ni peligroso.']
        };
        $('resultado').dataset.nivel = r.nivel;
        $('veredicto').textContent = textos[r.nivel][0];
        $('veredicto-resumen').textContent = textos[r.nivel][1];

        var lista = $('lista-senales');
        lista.innerHTML = '';
        var items = r.senales.length ? r.senales : ['No se encontraron señales de las que revisamos en este contenido.'];
        items.forEach(function (s) {
            var li = document.createElement('li');
            li.textContent = s;                               // textContent: el contenido nunca se ejecuta
            lista.appendChild(li);
        });

        $('ayuda-peligro').hidden = r.nivel !== 'peligroso';
        $('panel-nocontesta').hidden = true;
        $('panel-compartir').hidden = true;
        actualizarBotonLlamar();
        $('resultado').hidden = false;
        $('veredicto').focus();
    }

    /* --- Contacto de confianza (HU-026, 025, 030) --- */
    function leerContacto() {
        try { return JSON.parse(sessionStorage.getItem('ds_contacto')); } catch (e) { return null; }
    }
    function actualizarBotonLlamar() {
        var c = leerContacto();
        $('btn-llamar').href = c ? 'tel:' + c.tel.replace(/\D/g, '') : '#contacto';
        $('btn-llamar').textContent = c ? 'Llamar a mi contacto de confianza (' + c.nombre + ')' : 'Configurar mi contacto de confianza';
    }
    function pintarContacto() {
        var c = leerContacto();
        $('tarjeta-contacto').hidden = !c;
        $('conf-eliminar').hidden = true;
        if (c) {
            $('t-nombre').textContent = c.nombre;
            $('t-tel').textContent = c.tel;
            $('btn-llamar-ana').href = 'tel:' + c.tel.replace(/\D/g, '');
            $('btn-llamar-ana').textContent = 'Llamar a ' + c.nombre;
        }
        actualizarBotonLlamar();
    }
    $('form-contacto').addEventListener('submit', function (e) {
        e.preventDefault();
        var nombre = $('c-nombre').value.trim();
        var tel = $('c-tel').value.trim();
        var err = $('err-contacto');
        if (nombre === '' || tel.replace(/\D/g, '').length < 9 || /[^\d\s+]/.test(tel)) {
            err.textContent = 'Escribe un nombre y un teléfono válido (mínimo 9 dígitos) para guardar el contacto.';
            err.hidden = false;
            return;
        }
        err.hidden = true;
        sessionStorage.setItem('ds_contacto', JSON.stringify({ nombre: nombre, tel: tel }));
        pintarContacto();
    });
    $('btn-editar').addEventListener('click', function () {
        var c = leerContacto();
        $('c-nombre').value = c.nombre;
        $('c-tel').value = c.tel;
        $('c-nombre').focus();
    });
    $('btn-eliminar').addEventListener('click', function () { $('conf-eliminar').hidden = false; });
    $('btn-no-elim').addEventListener('click', function () { $('conf-eliminar').hidden = true; });
    $('btn-si-elim').addEventListener('click', function () {
        sessionStorage.removeItem('ds_contacto');
        $('c-nombre').value = '';
        $('c-tel').value = '';
        pintarContacto();
    });
    pintarContacto();

    /* --- Compartir con vista previa y confirmación (HU-028) y no contesta (HU-029) --- */
    $('btn-nocontesta').addEventListener('click', function () { $('panel-nocontesta').hidden = false; });
    $('btn-compartir').addEventListener('click', function () {
        var c = leerContacto();
        if (!c) { location.hash = 'contacto'; $('c-nombre').focus(); return; }
        $('comp-para').textContent = c.nombre;
        $('comp-msg').textContent = '“' + ultimo.texto.slice(0, 80) + '…” · Veredicto: Esto es peligroso';
        $('panel-compartir').hidden = false;
    });
    $('btn-canc-comp').addEventListener('click', function () { $('panel-compartir').hidden = true; });
    $('btn-conf-comp').addEventListener('click', function () {
        var c = leerContacto();
        var num = c.tel.replace(/\D/g, '');
        if (num.length === 9) num = '51' + num;
        var msg = 'Recibí este mensaje y CyberShield indica que es peligroso: ' + ultimo.texto.slice(0, 300).replace(/\./g, '[.]');
        window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
        $('panel-compartir').hidden = true;
    });

    /* --- Ayuda: datos expuestos (HU-037) --- */
    var RECOM = {
        nombre: 'Nombre: desconfía de llamadas o mensajes que lo usen para ganarse tu confianza.',
        tarjeta: 'Tarjeta: llama al canal oficial de tu banco y pide bloquearla.',
        sms: 'Código SMS: recupera el acceso desde la aplicación o canal oficial.',
        clave: 'Clave: cámbiala desde el canal oficial y no la repitas en otros sitios.',
        enlace: 'Enlace: no vuelvas a abrirlo ni ingreses datos si te lo piden.'
    };
    document.querySelectorAll('#ayuda input[type="checkbox"]').forEach(function (cb) {
        cb.addEventListener('change', function () {
            var lista = $('lista-recom');
            lista.innerHTML = '';
            var marcados = document.querySelectorAll('#ayuda input:checked');
            if (marcados.length === 0) {
                lista.innerHTML = '<li>Marca lo que compartiste para ver qué hacer primero.</li>';
                return;
            }
            marcados.forEach(function (m) {
                var li = document.createElement('li');
                li.textContent = RECOM[m.value];
                lista.appendChild(li);
            });
        });
    });

    /* --- Estado de conexión (HU-019) --- */
    window.addEventListener('online', function () { $('msg-form').hidden = true; });
}

/* Exportación para pruebas en Node */
if (typeof module !== 'undefined') module.exports = { analizarTexto: analizarTexto, tieneDatoSensible: tieneDatoSensible };
