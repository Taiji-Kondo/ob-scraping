import puppeteer from 'puppeteer';
import * as mysql from 'mysql2/promise';
import dotenv from 'dotenv'
import {RowDataPacket} from "mysql2";

/**
 * TODO:
 * - テーブル作成のinitファイルを作成
 * - seedファイルを作成
 * - ページネーション対応
 * - refactoring
 **/

// init dotenv
dotenv.config()

const PRODUCTS = {
  EMBODY_CHAIR: {
    url: 'https://www.officebusters.com/kensaku/index_k.php?st=&l=2&m=17&s=&k=&tenpo=&maker=28&condition_rank=4,5&color=1,4&amount=&kakaku_min=&kakaku_max=&dc=3&d_size=&h_size=&w_size=&tag_id=&series_id=2482&mrk=&f_func=&g_size=&cassette=&counter_num=&compound_machine_mono_per_minute=&compound_machine_color_per_minute=&launch_year=&view_mode=&pageNum_kensaku=1&cbl=&cbm=&cbs=&level=s',
    name: 'Herman Miller Embody Chair',
    tableName: 'chair_embody',
  },
  AERON_CHAIR: {
    url: 'https://www.officebusters.com/kensaku/index_k.php?st=6&l=2&m=17&s=&k=&tenpo=&maker=28&condition_rank=4,5&color=&amount=&kakaku_min=&kakaku_max=&dc=3&d_size=&h_size=&w_size=&tag_id=&series_id=1490&mrk=80&f_func=&g_size=&cassette=&counter_num=&compound_machine_mono_per_minute=&compound_machine_color_per_minute=&launch_year=&view_mode=photo&pageNum_kensaku=1&cbl=&cbm=&cbs=&level=s',
    name: 'Herman Miller Aeron Chair',
    tableName: 'chair_aeron',
  },
  CONTESSA_CHAIR: {
    url: 'https://www.officebusters.com/kensaku/index_k.php?st=&l=2&m=17&s=&k=&tenpo=&maker=28&condition_rank=4,5&color=1,4&amount=&kakaku_min=&kakaku_max=&dc=3&d_size=&h_size=&w_size=&tag_id=&series_id=2482&mrk=&f_func=&g_size=&cassette=&counter_num=&compound_machine_mono_per_minute=&compound_machine_color_per_minute=&launch_year=&view_mode=&pageNum_kensaku=1&cbl=&cbm=&cbs=&level=s',
    name: 'OKAMURA Contessa',
    tableName: 'chair_contessa',
  },
} as const satisfies Record<string, { url: string, name: string, tableName: string }>

const CONDITION_RANK = ['Ｓ', 'Ａ', 'Ｂ＋', 'Ｂ', 'Ｃ＋', 'Ｃ', 'Ｄ',] as const

type ChairType = {
  id: number
  name: string
  storeName: string
  url: string
  price: number
  condition: number
  inventory: number
  createdAt?: Date
  updatedAt?: Date
  deletedAt?: Date | null
}

const notifySlack = async (message: string) => {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) throw new Error('SLACK_WEBHOOK_URL is not set')

  try {
    const payload = {
      text: message,
    }
    await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error(error)
    throw new Error('failed to notify slack')
  }
}

const task = async () => {
  // connect to db
  const connection = await mysql.createConnection({
    host: process.env.DB_ROOT_HOST,
    user: process.env.DB_ROOT_USER,
    password: process.env.DB_ROOT_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const messages: string[] = []
  for await (const {name, url, tableName} of Object.values(PRODUCTS)) {
    await page.goto(url);

    // select corporate or individual
    const individualButton = await page.$('li[data-section="indivi"] > a');
    await individualButton?.click();

    // get page results
    const resultList = await page.waitForSelector('ul.result-group');
    const resultItems = await resultList?.$$('li.result');
    if (!resultItems) throw new Error('result items not found');

    // get current data from db
    const [rows] = await connection.query<RowDataPacket[]>(`SELECT * FROM ${tableName} WHERE deleted_at IS NULL`);
    const dbChairData: ChairType[] = [...rows as ChairType[]]

    // get latest data from page
    const latestChairData = await page.evaluate((CONDITION_RANK) => {
      const resultItems = document.querySelectorAll('li.result');
      const resultItemsArray = Array.from(resultItems);
      return resultItemsArray.map((item) => {
        const id = item.querySelector('p.result_detail_card_category-and-id_prod-id')?.textContent
        const name = item.querySelector('li.result_detail_card_series')?.textContent
        const storeName = item.querySelector('li.result_detail_card_tenpo')?.textContent
        const url = item.querySelector('a[href]')?.getAttribute('href')
        const price = item.querySelector('li.result_detail_card_price')?.textContent
        const conditionAndInventory = item.querySelector('p.result_detail_card_bottom_state')?.textContent
        if (!id || !name || !storeName || !url || !price || !conditionAndInventory) throw new Error('result item not found');

        const trimmedCondition = conditionAndInventory.replace('状態', '').replace('｜在庫数', '').replace(/[0-9]/g, '').trim()
        const condition = CONDITION_RANK.indexOf(trimmedCondition as typeof CONDITION_RANK[number])

        return {
          id: Number(id),
          name: name,
          storeName: storeName.trim(),
          url: url,
          price: Number(price.replace(/[^0-9]/g, '')),
          condition,
          inventory: Number(conditionAndInventory.replace(/[^0-9]/g, '')),
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
        item.url,
        item.price,
        item.condition,
        item.inventory,
      ]
    })
    const deleteIds = dbChairDataIds.filter((item) => !latestChairDataIds.includes(item))
    const deletePlaceholders = deleteIds.map(() => '?').join(',');

    // insert data
    if (insertData.length > 0) {
      connection.query(
        `INSERT INTO ${tableName} (id, name, store_name, url, price, \`condition\`, inventory) VALUES ?`,
        [insertData]
      );
    }
    // delete data which is not in latest data
    if (deleteIds.length > 0) {
      connection.query(
        `DELETE FROM ${tableName} WHERE id IN (${deletePlaceholders})`,
        [deleteIds]
      );
    }

    if (insertData.length > 0) {
      const message = `${name}に新着商品が${insertData.length}件あります\n
      ${insertData.map((item) => `id: ${item[0]}, price: ${item[4].toLocaleString()}円, condition: ${CONDITION_RANK[item[5] as number]}, url: ${item[3]}`).join('\n')}`
      messages.push(message)
    }
  }

  // notify slack
  await notifySlack(messages.join('\n\n'))

  // end connection
  connection.end();
  await browser.close();
}

// schedule task
task().then(() => {
  console.log('task finished')
  // const intervalTime = 1000 * 60 * 60 * 4 // 4 hours
  // setInterval(task, intervalTime)
})