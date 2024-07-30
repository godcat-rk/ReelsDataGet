const operate = require("./operate");
const config = require("config");
const moment = require("moment");
const driveAPI = require("./driveAPI");
const postChatworkMessage = require("post-chatwork-message");
const CHATWORK_API_KEY = "CHATWORK_API_KEY";
const roomId = "roomId";

const options = {
  name: "windows",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100",
  viewport: {
    width: 1378,
    height: 937,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    isLandscape: false,
  },
};

// スクレイピングを行うインスタグラムID
var login_id = config.login_id; //利用するアカウントID
var login_pw = config.login_pw; //利用するPW

// 取得したい月日と対象のアカウント
var target_year = process.argv[3];
var target_month = process.argv[4];
var target_account = process.argv[2];

var before_month_moment = moment().subtract(1, "month");

if (target_month == undefined) {
  target_month = before_month_moment.format("M");
}
if (target_year == undefined) {
  target_year = before_month_moment.format("YYYY");
}

var result_arr = [];
var post_date_arr = [];
var post_url_arr = [];

// csv出力先パス
const csv_path = __dirname + `/result/Reels_${target_account}_${target_year}_${target_month}.csv`;

// ドライブ出力先ID
const sheet_drive_id = "sheet_drive_id";
const image_drive_id = "image_drive_id";

(async () => {
  try {
    const page = await operate.puppeteerOn();
    await operate.instagramLogin(page, login_id, login_pw);

    await operate.accoutReelsOpen(page, target_account);

    // エンゲージメントを取得
    var reels_data_arr = await operate.getDataFromTop(page);
    // await console.log(reels_data_arr);

    await operate.reelsClick(page);

    var target_date = await moment({ year: target_year, month: target_month - 1 });

    // 指定した年月の投稿日のみを抽出するプロセス
    var first_check_flg = await true;
    var first_arr_count = await 0;
    for (i = 0; i < reels_data_arr["play"].length; i++) {
      // 投稿日を取得
      var returned_post_date = await operate.getPostDate(page);
      // console.log(returned_post_date)

      // 比較用のmomentオブジェクトを複製
      var for_compare_post_date = await returned_post_date.clone();
      var for_compare_post_date = await for_compare_post_date.date(1).hour(0).minutes(0).second(0).millisecond(0);

      //   日付判定
      if (for_compare_post_date.diff(target_date, "month") >= 1) {
        await reels_data_arr["like"].push(0)
        await reels_data_arr["comment"].push(0)
        await operate.nextPostButtonClick(page);
        continue;
      } else if (for_compare_post_date.diff(target_date, "month") <= -1) {
        break;
      } else if (for_compare_post_date.diff(target_date, "month") === 0) {
        await post_date_arr.push(returned_post_date);
        await post_url_arr.push(page.url());

        // いいね数を取得
        var like = await operate.countLikeFromPost(page);
        await reels_data_arr["like"].push(like)
        await console.log(reels_data_arr["like"])
        // コメント数を取得
        var comment = await operate.countCommentFromPost(page);
        await reels_data_arr["comment"].push(comment)

        await operate.nextPostButtonClick(page);


        if (first_check_flg) {
          first_arr_count = i;
          first_check_flg = await false;
        }
        //　次の投稿が存在するか
        if (!(await operate.checkNextPostButton)) {
          break;
        }

        continue;
      } else {
        throw new Error("投稿日の判定でエラーが起きています");
        break;
      }
    }

    for (var i = 0; i < post_date_arr.length; i++) {
      await result_arr.push({
        date: post_date_arr[i].format("YYYY/MM/DD hh:mm:ss"),
        like: reels_data_arr["like"][first_arr_count + i],
        comment: reels_data_arr["comment"][first_arr_count + i],
        play: reels_data_arr["play"][first_arr_count + i],
        image: reels_data_arr["image"][first_arr_count + i],
        url: post_url_arr[i],
      });
    }
  } catch (e) {
    console.log(e)
    postChatworkMessage(CHATWORK_API_KEY, roomId, `ReelsDataGet:inst Error\n ${e.stack}`);
  }
  await console.log(result_arr)
  // ローカル出力　現状不要
  // await operate.csvExport(result_arr, csv_path);

  // drive upload-----------
  try {
    await console.log(result_arr);
    for (var i = 0; i < result_arr.length; i++) {
      var upload_file_id = await driveAPI.driveUploadImage(result_arr[i]["image"], image_drive_id, `${target_account}_${result_arr[i]["date"]}`);
      await console.log(upload_file_id);
      result_arr[i]["id"] = await `https://drive.google.com/uc?export=download&id=${upload_file_id}`;
    }

    // -----------------------

    // create new sheet-------
    var sheet_id = await driveAPI.createSheet(sheet_drive_id, `Reels_${target_account}_${target_year}${target_month}`);

    await driveAPI.addDataToSheet(result_arr, sheet_id);

    await console.log("completed");
    await operate.puppeteerOff();
  } catch (e) {
    postChatworkMessage(CHATWORK_API_KEY, roomId, `ReelsDataGet:ggAPI Error\n ${e.stack}`);
  }
})();
