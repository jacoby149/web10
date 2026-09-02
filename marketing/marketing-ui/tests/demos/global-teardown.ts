import http from 'node:http';

const port = parseInt(process.env.DEMO_TEST_PORT || '3900', 10);

export default async function globalTeardown() {
  return new Promise<void>((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, () => {});
    req.on('error', () => {});
    setTimeout(resolve, 500);
  });
}