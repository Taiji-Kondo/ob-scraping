import puppeteer from 'puppeteer';

const EMBODY_CHAIR_URL =
  'https://www.officebusters.com/kensaku/index_k.php?st=&l=2&m=17&s=&k=&tenpo=&maker=28&condition_rank=4,5&color=1,4&amount=&kakaku_min=&kakaku_max=&dc=3&d_size=&h_size=&w_size=&tag_id=&series_id=2482&mrk=&f_func=&g_size=&cassette=&counter_num=&compound_machine_mono_per_minute=&compound_machine_color_per_minute=&launch_year=&view_mode=&pageNum_kensaku=1&cbl=&cbm=&cbs=&level=s';

(async () => {
  // const browser = await puppeteer.launch({ headless: true });
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(EMBODY_CHAIR_URL);

  // corporate or individual
  const individualButton = await page.waitForSelector('li[data-section="indivi"] > a');
  await individualButton.click();

  // get page result
  const resultList = await page.waitForSelector('ul.result-group');
  const resultItems = await resultList.$$('li.result');
  console.log(resultItems);

  await browser.close();
})();
