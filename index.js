// @see https://www.dns-shop.ru/sitemap.xml
const util = require('util');
util.inspect.defaultOptions.depth = 4;

const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const request = require('request-promise');
const xml = fs.readFileSync('./products1.xml');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const parser = new xml2js.Parser(/* options */);

async function load() {
  let parsed = await parser.parseStringPromise(xml);
  let urls = parsed.urlset.url.map(record => record.loc[0]);

  let products = [];
  for(let url of urls) {
    console.log(url);
    let productPage = await request({
      url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': '*/*'
      }
    });
    
    let product = parse(url, productPage);
    // console.log(product);
    products.push(product);
    if (products.length > 1000) {
      fs.writeFileSync('products.json', JSON.stringify(products));
      break;
    }
  }
}

function parse(url, productPage) {
  const document = new JSDOM(productPage).window.document;

  let product = {};

  product.title = parseTitle(document);
  product.sourceUrl = url;
  product.breadcrumb = parseBreadcrumb(document);
  
  product.id = url.split('/').filter(Boolean).pop();
  product.code = +document.querySelector('[data-product-param="code"]').innerHTML;
  product.price = parsePrice(document);
  product.images = parseImages(document);
  product.description = document.querySelector('[itemprop="description"]').innerHTML.replace(/.*<\/h2>/ims, '');

  product.characteristics = parseCharacteristics(document);
  
  return product;
}

function parsePrice(document) {
  let elem = document.querySelector('meta[itemprop="price"]');
  return elem ? +elem.getAttribute('content') : null;
}

function parseCharacteristics(document) {
  let characteristics = [];
  let characteristicElems = document.querySelectorAll('#main-characteristics tr');
  let section;
  for (let elem of characteristicElems) {
    let partElem = elem.querySelector('.table-part');
    if (partElem) {
      section = {
        title: partElem.innerHTML,
        items: []
      };
      if (elem.classList.contains('hidden')) {
        section.isExtended = true;
      }
      characteristics.push(section);
    } else {
      let item = {
        name: elem.querySelector('.dots span').firstChild.data.trim(),
        value: elem.querySelectorAll('td')[1].innerHTML.trim()
      };
      if (elem.classList.contains('extended-characteristic')) {
        item.isExtended = true;
      }
      section.items.push(item);
    }
  }

  return characteristics;
}

function parseImages(document) {
  let images = [];
  let imagesContainer = document.getElementById('thumbsSliderWrap') || document.getElementById('mainImageSliderWrap');
  let imageLinks = imagesContainer.querySelectorAll('[data-original]');
  for(let link of imageLinks) {
    images.push(link.dataset.original);
  }
  return images;

}

function parseTitle(document) {
  let breadcrumbElems = document.querySelector('[itemscope="http://schema.org/BreadcrumbList"]').querySelectorAll('[itemprop = "itemListElement"]');
  breadcrumbElems = Array.from(breadcrumbElems);

  let productElem = breadcrumbElems.pop();

  return productElem.querySelector('[itemprop="item"]').innerHTML;
}

function parseBreadcrumb(document) {
  let breadcrumbElems = document.querySelector('[itemscope="http://schema.org/BreadcrumbList"]').querySelectorAll('[itemprop = "itemListElement"]');
  breadcrumbElems = Array.from(breadcrumbElems);
  breadcrumbElems.pop();
  breadcrumbElems.shift();

  let breadcrumb = [];
  for (let elem of breadcrumbElems) {
    breadcrumb.push({
      href: elem.querySelector('[itemprop="item"]').href,
      name: elem.querySelector('[itemprop="name"]').innerHTML
    });
  }

  return breadcrumb;

}

load();
 