const puppeteer = require("puppeteer");
const moment = require("moment");
const { createObjectCsvWriter } = require("csv-writer");
const fs = require("fs");
const axios = require("axios");

// セレクタ達
const reels_selector = "._aajy";
// 日付セレクタ <time>が直下にくる<a>タグのクラス
const post_date_selector = "._aacl._aacm._aacu._aacy._aad6";
// 投稿を開いた時の >(次) ボタン
const next_post_selector = "._aaqg._aaqh";
// サムネイルにマウスホバーした時表示されるいいね数、コメント数の<li>クラス
const hover_engagement_selector = ".-V_eO";
// サムネイルに表示されているリール再生回数のdivクラス
const play_count_selector = "._aacl._aacp._aacw._aad3._aad6";
// サムネイルに表示されている画像のcdnリンクが含まれるdivクラス
const top_image_selector = "._aag6._aajx";
// 開いている投稿のいいね数、spanが直下にするdiv。複数あるので配列取得でラストを取り出す仕組み
const like_count_selector = "._aacl._aaco._aacw._aacx._aada._aade > span";
// 開いている投稿のコメント数、キャプションが含まれるので-1する。セレクタの数で判断するので数があっていれば何でもいい
const comment_count_selector = "._a9zr";

// browserを他の関数でも呼び出すために共通化(完全に設計ミス)
var browser = null;

const options = {
  name: "windows",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100",
  viewport: {
    width: 1378,
    height: 1300,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    isLandscape: false,
  },
};

// 起動
exports.puppeteerOn = async function () {
  browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    timeout: 50000,
    ignoreDefaultArgs: ["--disable-extensions"]
  });

  const page = await browser.newPage();
  await page.emulate(options);

  return page;
};

exports.puppeteerOff = async function () {
  await browser.close();
};

// ログイン処理
exports.instagramLogin = async function (page, login_id, login_pw) {
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2" });

  await page.setCacheEnabled(false);
  await page.reload({waitUntil: 'networkidle2'});

  var login_page_check = await page.$(".izU2O").then((res) => !!res);
  if (login_page_check) {
    await page.type('input[name="username"]', login_id);
    await page.type('input[name="password"]', login_pw);
    loadPromise = page.waitForNavigation({ timeout: 10000, waitUntil: "domcontentloaded" });
    await page.keyboard.press("Enter");
    await loadPromise;
  } else {
    throw new Error("ログインエラー");
  }
};

// アカウントプロフページ遷移
exports.accoutPageOpen = async function (page, target_account) {
  var account_page_url = `https://www.instagram.com/${target_account}/`;
  await page.goto(account_page_url);
};

// アカウントのリールページ遷移
exports.accoutReelsOpen = async function (page, target_account) {
  try{
    var account_reels_url = `https://www.instagram.com/${target_account}/reels/`;
    await page.goto(account_reels_url);
    await page.waitForSelector(reels_selector);
  }catch(e){
    console.log(e)
  }
};

// 最上段リールのクリック
exports.reelsClick = async function (page) {
  await page.waitForSelector(reels_selector);
  await page.click(reels_selector);
};

// 投稿を開いている時、その投稿日を返す
exports.getPostDate = async function (page) {
  await page.waitForSelector(post_date_selector);

  var post_date_obj = await page.$(post_date_selector);
  var post_date = await post_date_obj.$eval("time", (elm) => elm.getAttribute("datetime"));

  var post_date = await moment(post_date, "YYYY/MM/DD hh:mm:ss");
  // await console.log(post_date.format("YYYY/MM/DD hh:mm:ss"));

  return post_date;
};

// 次の投稿ボタンがあるか確認する
exports.checkNextPostButton = async function (page) {
  var button_exist = true;
  var exist = await page.$(next_post_selector).then((res) => !!res);
  if (exist) {
    button_exist = false;
  }
  return button_exist;
};

// 投稿を開いている時、次の投稿ボタンをクリックする。
exports.nextPostButtonClick = async function (page) {
  try{
    var exist = await page.$(next_post_selector).then((res) => !!res);
    if (exist) {
      await page.waitForSelector(next_post_selector);
      await page.click(next_post_selector);
    }
  }catch(e){
    console.log(e)
  }
};

// 仮想DOMのせいで下スクロールに伴い上が消えてしまうので現状50件が限界。要改修
// 20220706追加：いいね、コメントのセレクタが全て非表示になったので、ここの取得は無意味になった
exports.getDataFromTop = async function (page) {
  await page.waitForSelector(reels_selector);

  // スクロール
  await page._client.send("Input.synthesizeScrollGesture", {
    x: 0,
    y: 0,
    xDistance: 0,
    yDistance: -200,
    repeatCount: 2,
    repeatDelayMs: 200,
  });

  // 該当するオブジェクトを配列で取得
  var engagement_arr = await page.$$(hover_engagement_selector);
  var play_count_arr = await page.$$(play_count_selector);

  var datas = {};
  datas["like"] = [];
  datas["comment"] = [];
  datas["play"] = [];
  datas["image"] = [];

  // 再生回数を格納
  for (let i = 0; i < play_count_arr.length/3; i++) {
    datas["play"].push(await (await play_count_arr[2+i*3].getProperty("textContent")).jsonValue());
  }

  // サムネイルのcdnを取得
  var top_cdn_url_arr = await page.$$eval(top_image_selector, (list) => list.map((el) => el.style["background-image"]));
  for (var i = 0; i < top_cdn_url_arr.length; i++) {
    var first_colon_position = (await top_cdn_url_arr[i].indexOf('"')) + 1;
    top_cdn_url_arr[i] = await top_cdn_url_arr[i].slice(first_colon_position, top_cdn_url_arr[i].length);

    var last_colon_position = await top_cdn_url_arr[i].indexOf('"');
    top_cdn_url_arr[i] = await top_cdn_url_arr[i].slice(0, last_colon_position);

    await datas["image"].push(top_cdn_url_arr[i]);
  }

  return datas;
};

// 開いている投稿のいいね数をカウント
exports.countLikeFromPost = async function (page) {
  await page.waitForSelector(like_count_selector);

  var like_obj = await page.$(like_count_selector);
  var like_count = await (await like_obj.getProperty('textContent')).jsonValue();

  return like_count;
};

// 開いている投稿のコメント数をカウント
exports.countCommentFromPost = async function (page) {
  await page.waitForSelector(comment_count_selector);

  var comment_obj = await page.$$(comment_count_selector);
  var comment_count = comment_obj.length - 1

  return comment_count;
};


// csv出力処理
// オブジェクト配列のレコードであることが条件
exports.csvExport = async function (records, path) {
  // 配列のキーをヘッダーに
  const csv_writer_object = await createObjectCsvWriter({
    path: path,
    header: Object.keys(records[0]).map((v) => ({ id: v, title: v })),
  });

  // await console.log(csv_writer_object.csvStringifier.header);
  csv_writer_object.csvStringifier.header[0].title = await `\uFEFF${csv_writer_object.csvStringifier.header[0].title}`;

  //書き出し
  await csv_writer_object.writeRecords(records); // returns a promise
};

exports.cdnToBinary = async function (cdn_arr) {
  var image_binary_arr = [];

  for (var i = 0; i < cdn_arr.length; i++) {
    var res = await axios.get(cdn_arr[i], { responseType: "arraybuffer" });
    var buffer = new Buffer.from(res.data);
    await image_binary_arr.push(buffer);
  }

  return image_binary_arr;
};

// キャッシュ削除
exports.reCache = async function (page) {
  await page.setCacheEnabled(false);
  await page.reload({waitUntil: 'networkidle2'});
};
