function handler(event) {
    var request = event.request;
    var uri = request.uri || '/';
    var last = uri.split('/').pop();

    // Documento comercial con URL limpia.
    if (uri === '/propuesta' || uri === '/propuesta/') {
        request.uri = '/propuesta.html';
        return request;
    }

    // Rutas de SPA sin extensión (/login, /clientes, /c/RFC) -> index.html.
    if (uri === '/' || last.indexOf('.') === -1) {
        request.uri = '/index.html';
    }

    return request;
}
