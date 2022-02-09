import express, { json } from 'express';

const app = express();
const port = 4000;

app.use(json());
const server = app.listen(port, () => {
  console.log(`mock server listening on ${port}`);
});

export { app, server };
