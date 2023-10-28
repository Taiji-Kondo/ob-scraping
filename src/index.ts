import puppeteer from 'puppeteer';
import * as mysql from 'mysql2';
import dotenv from 'dotenv'

// init dotenv
dotenv.config()

const EMBODY_CHAIR_URL =
  'https://www.officebusters.com/kensaku/index_k.php?st=&l=2&m=17&s=&k=&tenpo=&maker=28&condition_rank=4,5&color=1,4&amount=&kakaku_min=&kakaku_max=&dc=3&d_size=&h_size=&w_size=&tag_id=&series_id=2482&mrk=&f_func=&g_size=&cassette=&counter_num=&compound_machine_mono_per_minute=&compound_machine_color_per_minute=&launch_year=&view_mode=&pageNum_kensaku=1&cbl=&cbm=&cbs=&level=s';

// connect to db
const connection = mysql.createConnection({
  host: process.env.DB_ROOT_HOST,
  user: process.env.DB_ROOT_USER,
  password: process.env.DB_ROOT_PASSWORD,
  database: process.env.DB_DATABASE,
});

(async () => {
  // const browser = await puppeteer.launch({ headless: true });
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(EMBODY_CHAIR_URL);

  // select corporate or individual
  const individualButton = await page.waitForSelector('li[data-section="indivi"] > a');
  if (!individualButton) throw new Error('individual button not found');
  await individualButton.click();

  // get page results
  const resultList = await page.waitForSelector('ul.result-group');
  const resultItems = await resultList?.$$('li.result');
  if (!resultItems) throw new Error('result items not found');
  for await (const item of resultItems) {
    const productId = await item.$('p.result_detail_card_category-and-id_prod-id');
    console.log(productId);
  }

  connection.query('SELECT * FROM `chair_embody`', function (err, results, fields) {
    console.log({ results });
    console.log({ fields });
  });

  await browser.close();
})();
