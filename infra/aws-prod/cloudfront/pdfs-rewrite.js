function handler(event) {
    var request = event.request;
    var uri = request.uri || '';

    // El bucket guarda prod/storage/{RFC}/{archivo}.pdf.
    // El visor sigue usando /pdfs/{RFC}/{archivo}.pdf.
    if (uri.indexOf('/pdfs/') === 0) {
        request.uri = '/__DOCS_PREFIX__/storage/' + uri.substring(6);
    }

    return request;
}
