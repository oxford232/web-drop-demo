const downloadMap = new Map();
const bufferMap = new Map();

const handleMessage = (e) => {
  if (typeof e.data === "string") {
    const type = e.data[0];
    if (type === '0') {
      const downloadUrl = e.data.substring(1);
      downloadMap.set(downloadUrl, e.target);
      e.target.postMessage("1" + downloadUrl);
    }
  } else {
    if (!bufferMap.has(e.target)) {
      bufferMap.set(e.target, []);
    }
    bufferMap.get(e.target).push(e.data);
  }
}


self.addEventListener('message', (event) => {
  if (event.data.type === "SW_PORT_TRANSFER") {
    const { port } = event.data;
    port.onmessage = handleMessage;
  }
})


self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (downloadMap.has(event.request.url)) {
    const name = decodeURIComponent(url.searchParams.get('name'));
    const size = url.searchParams.get('size');
    const port = downloadMap.get(event.request.url);
    const bufferedData = bufferMap.get(port);
    bufferMap.delete(port);
    downloadMap.delete(event.request.url);
    let receivedSize = 0;

    const stream = new ReadableStream({
      start(controller) {
        if (bufferedData) {
          bufferedData.forEach((data) => {
            controller.enqueue(data);
            receivedSize += data.length;
          })
        }

        if (receivedSize === parseInt(size, 10)) {
          controller.close();
          port.onmessage = handleMessage;
        } else {
          port.onmessage = (e) => {
            if (e.data === 'ABORT') {
              controller.error('Aborted by main thread');
              // port.close();
            } else {
              // console.log('sw data: ', e.data);
              controller.enqueue(e.data);
              receivedSize += e.data.length;
              if (receivedSize === parseInt(size, 10)) {
                controller.close();
                port.onmessage = handleMessage;
              }
            }
          }
        }
      },
      cancel() {
        console.log('user canceled');
        port.postMessage('USER_CANCELED');
        // port.close();
      }
    });
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="'+ name +'"',
      'Content-Length': size
    });

    event.respondWith(new Response(stream, { headers }));
  }
});