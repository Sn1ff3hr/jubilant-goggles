export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Expected POST request', { status: 405 });
    }

    try {
      const data = await request.json();
      console.log('Received data:', JSON.stringify(data, null, 2));

      // In a real worker, you would process the data here,
      // for example, by sending it to a database or another API.

      return new Response(JSON.stringify({ success: true, message: 'Order received' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error processing request:', error);
      return new Response(JSON.stringify({ success: false, message: 'Failed to process order' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
