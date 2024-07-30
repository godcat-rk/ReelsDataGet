const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const axios = require("axios");
const stream = require("stream");
const sheets = google.sheets('v4');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.file', "https://www.googleapis.com/auth/drive.appdata", "https://www.googleapis.com/auth/spreadsheets"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';
var oAuth2Client;
(async () => {
    // credentialsを読み込む
    await fs.readFile('credentials.json', async (err, content) => {
        const { client_secret, client_id, redirect_uris } = JSON.parse(content).installed;
        // credentialsからoAuth2Clientを取得
        oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);
        // tokenを設定
        await fs.readFile(TOKEN_PATH, async (err, token) => {
            await oAuth2Client.setCredentials(JSON.parse(token));
        });
    });
})();


exports.driveUploadImage = async function(image_url, drive_folder_id, file_name) {
    var drive = google.drive({ version: 'v3', auth: oAuth2Client });
    var FOLDER_ID = drive_folder_id;

    var image_res = await axios.get(image_url, { responseType: 'arraybuffer' });
    var image_data = new Buffer.from(image_res.data, "base64");


    var bs = await new stream.PassThrough();
    await bs.end(image_data);

    var params = {
        resource: {
            name: file_name,
            parents: [FOLDER_ID]
        },
        media: {
            mimeType: 'image/jpeg',
            body: bs
        },
        fields: 'id'
    };

    var upload_res = await drive.files.create(params);

    // 格納したファイルidを返す
    return upload_res.data.id;
}

// 新規スプレッドシートの作成と指定フォルダへの格納処理
exports.createSheet = async function(drive_folder_id, file_name) {
    var drive = google.drive({ version: 'v3', auth: oAuth2Client });
    var FOLDER_ID = drive_folder_id;
    // 新規スプレッドシートの作成
    // 指定フォルダへの新規作成ができない残念仕様なので移動処理を後半に行う
    var ss_create_res = await sheets.spreadsheets.create({
        resource: {
            properties: {
                title: file_name

            }
        },
        auth: oAuth2Client,
    })

    // 作成したスプレッドシートを指定フォルダへ移動
    var ss_file_id = ss_create_res.data.spreadsheetId;
    var move_param = {
        addParents: [FOLDER_ID],
        removeParents: 'root',
        fileId: ss_file_id
    };
    await drive.files.update(move_param);

    return ss_file_id;
}

exports.addDataToSheet = async function(datas, sheet_id) {
    var drive = google.drive({ version: 'v3', auth: oAuth2Client });

    // 見出し作成
    await sheets.spreadsheets.values.append({
        spreadsheetId: sheet_id,
        range: 'シート1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
            values: [
                ["日付", "いいね", "コメント", "再生数", "画像", "投稿URL"]
            ],
        },
        auth: oAuth2Client
    });

    // データの格納
    for (var i = 0; i < datas.length; i++) {
        var image_formula = `=IMAGE("${datas[i]['id']}")`;
        await sheets.spreadsheets.values.append({
            spreadsheetId: sheet_id,
            range: 'シート1',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [
                    [datas[i]["date"], datas[i]["like"], datas[i]["comment"], datas[i]["play"], image_formula, datas[i]["url"]]
                ],
            },
            auth: oAuth2Client
        });
    }
}

// 以下認証に利用したクイックスタートのコピー

// function authorize(credentials, callback) {
//     const { client_secret, client_id, redirect_uris } = credentials.installed;
//     const oAuth2Client = new google.auth.OAuth2(
//         client_id, client_secret, redirect_uris[0]);

//     // Check if we have previously stored a token.
//     fs.readFile(TOKEN_PATH, (err, token) => {
//         if (err) return getNewToken(oAuth2Client, callback);
//         oAuth2Client.setCredentials(JSON.parse(token));
//         callback(oAuth2Client);
//     });
// }

// function getNewToken(oAuth2Client, callback) {
//     const authUrl = oAuth2Client.generateAuthUrl({
//         access_type: 'offline',
//         scope: SCOPES,
//     });
//     console.log('Authorize this app by visiting this url:', authUrl);
//     const rl = readline.createInterface({
//         input: process.stdin,
//         output: process.stdout,
//     });
//     rl.question('Enter the code from that page here: ', (code) => {
//         rl.close();
//         oAuth2Client.getToken(code, (err, token) => {
//             if (err) return console.error('Error while trying to retrieve access token', err);
//             oAuth2Client.setCredentials(token);
//             // Store the token to disk for later program executions
//             fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
//                 if (err) return console.error(err);
//                 console.log('Token stored to', TOKEN_PATH);
//             });
//             callback(oAuth2Client);
//         });
//     });
// }




// /**
//  * Get and store new token after prompting for user authorization, and then
//  * execute the given callback with the authorized OAuth2 client.
//  * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
//  * @param {getEventsCallback} callback The callback for the authorized client.
//  */
// function getAccessToken(oAuth2Client, callback) {
//     const authUrl = oAuth2Client.generateAuthUrl({
//         access_type: 'offline',
//         scope: SCOPES,
//     });
//     console.log('Authorize this app by visiting this url:', authUrl);
//     const rl = readline.createInterface({
//         input: process.stdin,
//         output: process.stdout,
//     });
//     rl.question('Enter the code from that page here: ', (code) => {
//         rl.close();
//         oAuth2Client.getToken(code, (err, token) => {
//             if (err) return console.error('Error retrieving access token', err);
//             oAuth2Client.setCredentials(token);
//             // Store the token to disk for later program executions
//             fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
//                 if (err) return console.error(err);
//                 console.log('Token stored to', TOKEN_PATH);
//             });
//             callback(oAuth2Client);
//         });
//     });
// }


/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
function listMajors() {
    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    sheets.spreadsheets.values.get({
        spreadsheetId: 'spreadsheetId',
        range: 'Class Data!A2:E',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        const rows = res.data.values;
        if (rows.length) {
            console.log('Name, Major:');
            // Print columns A and E, which correspond to indices 0 and 4.
            rows.map((row) => {
                console.log(`${row[0]}, ${row[4]}`);
            });
        } else {
            console.log('No data found.');
        }
    });
}