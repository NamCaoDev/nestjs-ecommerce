/* eslint-disable */
import axios from 'axios';

module.exports = async function () {
  // Requests without an absolute URL go to the payment service.
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? '3300';
  axios.defaults.baseURL = `http://${host}:${port}`;
};
