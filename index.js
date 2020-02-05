// @see https://www.dns-shop.ru/sitemap.xml
const util = require('util');
util.inspect.defaultOptions.depth = 4;

const xml2js = require('xml2js');
const fs = require('fs-extra');
const path = require('path');
const request = require('request-promise');
const requestPure = require('request');
const xml = fs.readFileSync('./products1.xml');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const parser = new xml2js.Parser(/* options */);
const imageRoot = path.resolve(__dirname, 'download/image');
const productRoot = path.resolve(__dirname, 'download/product');

fs.ensureDirSync(imageRoot);
fs.ensureDirSync(productRoot);

async function load() {
  let parsed = await parser.parseStringPromise(xml);
  let urls = parsed.urlset.url.map(record => record.loc[0]);

  for(let url of urls) {
    let id = url.split('/').filter(Boolean).pop();
    if (fs.existsSync(`${productRoot}/${id}.json`)) continue;

    console.log(url);
    
    let productPage;
    if (fs.existsSync(`${productRoot}/${id}.html`)) {
      productPage = fs.readFileSync(`${productRoot}/${id}.html`, {encoding: 'utf-8'});
    } else {
      productPage = await loadUrl({ url });
      if (productPage === null) continue; // no such product
      fs.writeFileSync(`${productRoot}/${id}.html`, productPage);
    }

    let product = parse(productPage);
    product.id = id;
    product.sourceUrl = url;

    let jobs = [];
    for(let url of product.images) {
      let filename = path.basename(url);
      if (fs.existsSync(`${imageRoot}/${filename}`)) {
        continue;
      }

      console.log(url);

      let job = await loadUrl({
        url,
        encoding: null
      })
        .then(function(res) {
          const buffer = Buffer.from(res, 'utf8');
          fs.writeFileSync(`${imageRoot}/${filename}`, buffer);
        });
      jobs.push(job);
    }
    await Promise.all(jobs);

    fs.writeFileSync(`${productRoot}/${id}.json`, JSON.stringify(product, null, 2));
  }
}

async function loadUrl(options = {}) {

  // using requestPure cause (maybe) request-promise aborts on ESOCKETTIMEOUT 
  return new Promise((resolve, reject) => {
    requestPure(Object.assign({
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': '*/*'
      },
      timeout: 20000
    }, options), (error, response, body) => {
      if (error) {
        if (error.code == 'ESOCKETTIMEDOUT') {
          resolve(loadUrl(options));
        } else {
          reject(error);
        }
      } else {
        if (response.statusCode == 410) {
          // not such product any more
          resolve(null);
        } else if (response.statusCode != 200) {
          console.log(response);
          throw new Error("BAD RESPONSE");
        } else {
          resolve(body);
        }
      }
    });
  });
}

function parse(productPage) {
  const document = new JSDOM(productPage).window.document;

  let product = {};

  product.title = parseTitle(document);
  product.breadcrumb = parseBreadcrumb(document);
  
  product.code = +document.querySelector('[data-product-param="code"]').innerHTML;
  product.price = parsePrice(document);
  product.images = parseImages(document);
  product.description = document.querySelector('[itemprop="description"]').querySelector('p').textContent;

  product.characteristics = parseCharacteristics(document);
  
  product.rating = parseRating(document);
  
  product.guid = parseGuid(document);
  
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

function parseRating(document) {
  let ratingElem = document.querySelector('[itemprop="ratingValue"]');
  if (!ratingElem) return null;
  return ratingElem.textContent;
}

function parseGuid(document) {
  let productGuidContainerEl = document.getElementById('product-page');
  return productGuidContainerEl.dataset.id;
}

load();
