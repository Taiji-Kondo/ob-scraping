import puppeteer from 'puppeteer';
import * as mysql from 'mysql2';
import dotenv from 'dotenv'

// init dotenv
dotenv.config()

const EMBODY_CHAIR_URL =
  'https://www.officebusters.com/kensaku/index_k.php?st=&l=2&m=17&s=&k=&tenpo=&maker=28&condition_rank=4,5&color=1,4&amount=&kakaku_min=&kakaku_max=&dc=3&d_size=&h_size=&w_size=&tag_id=&series_id=2482&mrk=&f_func=&g_size=&cassette=&counter_num=&compound_machine_mono_per_minute=&compound_machine_color_per_minute=&launch_year=&view_mode=&pageNum_kensaku=1&cbl=&cbm=&cbs=&level=s';
const CONDITION_RANK = {
  'Ｓ': 1,
  'Ａ': 2,
  'Ｂ＋': 3,
  'Ｂ': 4,
  'Ｃ＋': 5,
  'Ｃ': 6,
  'Ｄ': 7,
} as const

type ChairType = {
  id: number
  name: string
  storeName: string
  price: number
  condition: typeof CONDITION_RANK[keyof typeof CONDITION_RANK]
  inventory: number
}

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

  const data = await page.evaluate((CONDITION_RANK) => {
    const resultItems = document.querySelectorAll('li.result');
    const resultItemsArray = Array.from(resultItems);
    return resultItemsArray.map((item) => {
      const id = item.querySelector('p.result_detail_card_category-and-id_prod-id')?.textContent
      const name= item.querySelector('li.result_detail_card_series')?.textContent
      const storeName= item.querySelector('li.result_detail_card_tenpo')?.textContent
      const price= item.querySelector('li.result_detail_card_price')?.textContent
      const conditionAndInventory= item.querySelector('p.result_detail_card_bottom_state')?.textContent
      if (!id || !name || !storeName || !price || !conditionAndInventory) throw new Error('result item not found');

      const trimmedCondition = conditionAndInventory.replace('状態', '').replace('｜在庫数', '').replace(/[0-9]/g, '').trim()
      const condition = CONDITION_RANK[trimmedCondition as keyof typeof CONDITION_RANK]

      return {
        id: Number(id),
        name: name,
        storeName: storeName.trim(),
        price: Number(price.replace(/[^0-9]/g, '')),
        condition,
        inventory: Number(conditionAndInventory.replace(/[^0-9]/g, ''))
      }
    }) satisfies ChairType[]

  }, CONDITION_RANK)

  // insert data to db
  const values = data.map(item => [
    item.id,
    item.name,
    item.storeName,
    item.price,
    item.condition,
    item.inventory
  ])
  connection.query(
    'INSERT INTO `chair_embody` (id, name, store_name, price, `condition`, inventory) VALUES ?',
    [values]
  );

  // end connection
  connection.end();
  await browser.close();
})();
