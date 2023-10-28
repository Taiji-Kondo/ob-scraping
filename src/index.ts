import puppeteer from 'puppeteer';
import * as mysql from 'mysql2/promise';
import dotenv from 'dotenv'
import {RowDataPacket} from "mysql2";

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
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

(async () => {
  // connect to db
  const connection = await mysql.createConnection({
    host: process.env.DB_ROOT_HOST,
    user: process.env.DB_ROOT_USER,
    password: process.env.DB_ROOT_PASSWORD,
    database: process.env.DB_DATABASE,
  });

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

  // get current data from db
  const [rows] = await connection.query<RowDataPacket[]>(`SELECT * FROM chair_embody WHERE deleted_at IS NULL`);
  const dbChairData: ChairType[] = [...rows as ChairType[]]

  // get latest data from page
  const latestChairData = await page.evaluate((CONDITION_RANK) => {
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
        inventory: Number(conditionAndInventory.replace(/[^0-9]/g, '')),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      }
    }) satisfies ChairType[]

  }, CONDITION_RANK)

  const dbChairDataIds = dbChairData.map((item) => item.id)
  const latestChairDataIds = latestChairData.map((item) => item.id)
  const insertData = latestChairData.filter((item) => !dbChairDataIds.includes(item.id)).map((item) => {
    return [
      item.id,
      item.name,
      item.storeName,
      item.price,
      item.condition,
      item.inventory,
      item.createdAt,
      item.updatedAt,
      item.deletedAt
    ]
  })
  const deleteIds = dbChairDataIds.filter((item) => !latestChairDataIds.includes(item))
  const deletePlaceholders = deleteIds.map(() => '?').join(',');

  // insert data
  if (insertData.length > 0){
    connection.query(
      `INSERT INTO chair_embody (id, name, store_name, price, \`condition\`, inventory, created_at, updated_at, deleted_at) VALUES ?`,
      [insertData]
    );
  }
  // delete data which is not in latest data
  if (deleteIds.length > 0) {
    connection.query(
      `DELETE FROM chair_embody WHERE id IN (${deletePlaceholders})`,
      [deleteIds]
    );
  }

  // end connection
  connection.end();
  await browser.close();
})();

const TEST_DATA = [
  {
    id: 1,
    name: 'name1',
    storeName: 'storeName1',
    price: 10000,
    condition: 1,
    inventory: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  },
  {
    id: 2,
    name: 'name2',
    storeName: 'storeName2',
    price: 20000,
    condition: 2,
    inventory: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  },
  {
    id: 3,
    name: 'name3',
    storeName: 'storeName3',
    price: 30000,
    condition: 3,
    inventory: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  },
  {
    id: 4,
    name: 'name4',
    storeName: 'storeName4',
    price: 40000,
    condition: 4,
    inventory: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  }
]