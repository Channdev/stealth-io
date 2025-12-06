import stealthIO from 'stealth-io';

const response = await stealthIO.get('https://github.com/');

console.log(response.ok);
console.log(response.status);
console.log(response.statusText);
console.log(response.url);
console.log(response.headers.get('content-type'));
console.log(response.headers.entries());