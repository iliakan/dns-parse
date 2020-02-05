const path = require('path');
const glob = require('glob');
const imageRoot = path.resolve(__dirname, 'download/image');
const productRoot = path.resolve(__dirname, 'download/product');
const fs = require('fs');
const jsons = glob.sync(`${productRoot}/*.json`);
let products = [];
for(let json of jsons) {
  products.push(JSON.parse(fs.readFileSync(json)));
}

for(let product of products) {
  let paragraphs = product.description.match(/<p>/gi);
  if (paragraphs.length != 1) console.log(paragraphs.length, product.description);
}