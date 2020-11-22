/*
jd宠汪汪 搬的https://github.com/uniqueque/QuantumultX/blob/4c1572d93d4d4f883f483f907120a75d925a693e/Script/jd_joy.js
脚本兼容: QuantumultX, Surge, Loon, JSBox, Node.js
IOS用户支持京东双账号,NodeJs用户支持N个京东账号
更新时间：2020-11-03
建议先凌晨0点运行jd_joy.js脚本获取狗粮后，再运行此脚本(jd_joy_steal.js)可偷好友积分，6点运行可偷好友狗粮
feedCount:自定义 每次喂养数量; 等级只和喂养次数有关，与数量无关
推荐每次投喂10个，积累狗粮，然后去聚宝盆赌每小时的幸运奖，据观察，投入3000-6000中奖概率大，超过7000基本上注定亏本，即使是第一名
Combine from Zero-S1/JD_tools(https://github.com/Zero-S1/JD_tools)
更新时间:2020-10-20
注：如果使用Node.js, 需自行安装'crypto-js,got,http-server,tough-cookie'模块. 例: npm install crypto-js http-server tough-cookie got --save
*/
// quantumultx
// [task_local]
// #京东宠汪汪
// 15 */2 * * * https://raw.githubusercontent.com/lxk0301/scripts/master/jd_joy.js, tag=京东宠汪汪, img-url=https://raw.githubusercontent.com/58xinian/icon/master/jdcww.png, enabled=true
// Loon
// [Script]
// cron "15 */2 * * *" script-path=https://raw.githubusercontent.com/lxk0301/scripts/master/jd_joy.js,tag=京东宠汪汪
// Surge
// 京东宠汪汪 = type=cron,cronexp="15 */2 * * *",wake-system=1,timeout=20,script-path=https://raw.githubusercontent.com/lxk0301/scripts/master/jd_joy.js
const {Env} = require('../../utils/Env')
const $ = new Env('宠汪汪');
const notify = $.isNode() ? require('../../utils/sendNotify') : '';
//Node.js用户请在jdCookie.js处填写京东ck;
const jdCookieNode = $.isNode() ? require('../../utils/jdCookie') : '';

//IOS等用户直接用NobyDa的jd cookie
let cookiesArr = [], cookie = '';
if ($.isNode()) {
  Object.keys(jdCookieNode).forEach((item) => {
    cookiesArr.push(jdCookieNode[item])
  })
  if (process.env.JD_DEBUG && process.env.JD_DEBUG === 'false') console.log = () => {
  };
} else {
  cookiesArr.push($.getdata('CookieJD'));
  cookiesArr.push($.getdata('CookieJD2'));
}
let message = '', subTitle = '';
let FEED_NUM = ($.getdata('joyFeedCount') * 1) || 10;   //每次喂养数量 [10,20,40,80]
//是否参加宠汪汪双人赛跑（据目前观察，参加双人赛跑不消耗狗粮,如需参加其他多人赛跑，请关闭）
// 默认 'true' 参加双人赛跑，如需关闭 ，请改成 'false';
let joyRunFlag = true;
let jdNotify = true;//是否开启静默运行，默认true开启
const JD_API_HOST = 'https://jdjoy.jd.com/pet'
const weAppUrl = 'https://draw.jdfcloud.com//pet';
!(async () => {
  if (!cookiesArr[0]) {
    $.msg($.name, '【提示】请先获取京东账号一cookie\n直接使用NobyDa的京东签到获取', 'https://bean.m.jd.com/', {"open-url": "https://bean.m.jd.com/"});
    return;
  }
  for (let i = 0; i < cookiesArr.length; i++) {
    if (cookiesArr[i]) {
      cookie = cookiesArr[i];
      $.UserName = decodeURIComponent(cookie.match(/pt_pin=(.+?);/) && cookie.match(/pt_pin=(.+?);/)[1])
      $.index = i + 1;
      $.isLogin = true;
      $.nickName = '';
      await TotalBean();
      console.log(`\n开始【京东账号${$.index}】${$.nickName || $.UserName}\n`);
      if (!$.isLogin) {
        $.msg($.name, `【提示】cookie已失效`, `京东账号${$.index} ${$.nickName || $.UserName}\n请重新登录获取\nhttps://bean.m.jd.com/`, {"open-url": "https://bean.m.jd.com/"});
        $.setdata('', `CookieJD${i ? i + 1 : ""}`);//cookie失效，故清空cookie。
        if ($.isNode()) await notify.sendNotify(`${$.name}cookie已失效 - ${$.UserName}`, `京东账号${$.index} ${$.UserName}\n请重新登录获取cookie`);
        continue
      }
      message = '';
      subTitle = '';
      await jdJoy();
      await showMsg();
      // await joinTwoPeopleRun();
    }
  }
})()
  .catch((e) => {
    $.log('', `❌ ${$.name}, 失败! 原因: ${e}!`, '')
  })
  .finally(() => {
    $.done();
  })

async function jdJoy() {
  await getPetTaskConfig();
  if ($.getPetTaskConfigRes.success) {
    if ($.isNode()) {
      if (process.env.JOY_FEED_COUNT) {
        if ([10, 20, 40, 80].indexOf(process.env.JOY_FEED_COUNT * 1) > -1) {
          FEED_NUM = process.env.JOY_FEED_COUNT ? process.env.JOY_FEED_COUNT * 1 : FEED_NUM;
        } else {
          console.log(`您输入的 JOY_FEED_COUNT 为非法数字，请重新输入`);
        }
      }
    }
    await feedPets(FEED_NUM);//喂食
    await Promise.all([
      petTask(),
      appPetTask()
    ])
    await deskGoodsTask();//限时货柜
    await enterRoom();
    await joinTwoPeopleRun()//参加双人赛跑
  } else {
    message += `${$.getPetTaskConfigRes.errorMessage}`;
  }
}

//逛商品得100积分奖励任务
async function deskGoodsTask() {
  const deskGoodsRes = await getDeskGoodDetails();
  if (deskGoodsRes && deskGoodsRes.success) {
    if (deskGoodsRes.data && deskGoodsRes.data.deskGoods) {
      const {deskGoods, taskChance, followCount = 0} = deskGoodsRes.data;
      console.log(`浏览货柜商品 ${followCount ? followCount : 0}/${taskChance}`);
      if (taskChance === followCount) return
      for (let item of deskGoods) {
        if (!item['status'] && item['sku']) {
          await followScan(item['sku'])
        }
      }
    } else {
      console.log(`限时商品货架已下架`);
    }
  }
}

//参加双人赛跑
async function joinTwoPeopleRun() {
  joyRunFlag = $.getdata('joyRunFlag') ? $.getdata('joyRunFlag') : joyRunFlag;
  if ($.isNode() && process.env.JOY_RUN_FLAG) {
    joyRunFlag = process.env.JOY_RUN_FLAG;
  }
  if (`${joyRunFlag}` === 'true') {
    console.log(`\n===========以下是双人赛跑信息========\n`)
    await getPetRace();
    if ($.petRaceResult) {
      let petRaceResult = $.petRaceResult.data.petRaceResult;
      let raceUsers = $.petRaceResult.data.raceUsers;
      console.log(`赛跑状态：${petRaceResult}\n`);
      if (petRaceResult === 'not_participate') {
        console.log('暂未参赛，现在为您参加双人赛跑');
        await runMatch(2);
        if ($.runMatchResult.success) {
          console.log(`双人赛跑参加成功\n`);
          message += `双人赛跑：成功参加\n`;
          await getPetRace();
          petRaceResult = $.petRaceResult.data.petRaceResult;
          raceUsers = $.petRaceResult.data.raceUsers;
          // console.log(`参赛后的状态：${petRaceResult}`)
          console.log(`双人赛跑助力请自己手动去邀请好友，脚本不带赛跑助力功能\n`);
        }
      }
      if (petRaceResult === 'unbegin') {
        console.log('比赛还未开始，请九点再来');
      }
      if (petRaceResult === 'time_over') {
        console.log('今日参赛的比赛已经结束，请明天九点再来');
      }
      if (petRaceResult === 'unreceive') {
        console.log('今日参赛的比赛已经结束，现在领取奖励');
        await receiveJoyRunAward();
        console.log(`领取赛跑奖励结果：${JSON.stringify($.receiveJoyRunAwardRes)}`)
        if ($.receiveJoyRunAwardRes.success) {
          $.msg($.name, '双人赛跑取得获胜', `【京东账号${$.index}】${$.nickName}\n太棒了,恭喜您获得300积分奖励`)
        }
      }
      if (petRaceResult === 'participate') {
        if (raceUsers) {
          for (let index = 0; index < raceUsers.length; index++) {
            if (raceUsers[index].myself) {
              console.log(`您当前里程：${raceUsers[index].distance}KM\n`);
              message += `您当前里程：${raceUsers[index].distance}km\n`;
            } else {
              console.log(`对手当前里程：${raceUsers[index].distance}KM\n`);
              message += `对手当前里程：${raceUsers[index].distance}km\n`;
            }
          }
        }
        console.log('今日已参赛，下面显示应援团信息\n');
        await getBackupInfo();
        if ($.getBackupInfoResult.success) {
          const {currentNickName, totalMembers, totalDistance, backupList} = $.getBackupInfoResult.data;
          console.log(`${currentNickName}的应援团信息如下\n团员：${totalMembers}个\n团员助力的里程数：${totalDistance}\n`);
          if (backupList && backupList.length > 0) {
            for (let item of backupList) {
              console.log(`${item.nickName}为您助力${item.distance}km\n`);
            }
          } else {
            console.log(`暂无好友为您助力赛跑，如需助力，请手动去邀请好友助力\n`);
          }
        }
      }
    }
  } else {
    console.log(`您设置的是不参加双人赛跑`)
  }
}

//日常任务
async function petTask() {
  for (let item of $.getPetTaskConfigRes.datas) {
    const joinedCount = item.joinedCount || 0;
    if (item['receiveStatus'] === 'chance_full') {
      console.log(`${item.taskName} 任务已完成`)
      continue
    }
    //每日签到
    if (item['taskType'] === 'SignEveryDay') {
      if (item['receiveStatus'] === 'chance_left') {
        console.log('未完成,需要自己手动去微信小程序【来客有礼】签到，可获得京豆奖励')
      } else if (item['receiveStatus'] === 'unreceive') {
        //已签到，领取签到后的狗粮
        const res = await getFood('SignEveryDay');
        console.log(`领取每日签到狗粮结果：${res.data}`);
      }
    }
    //邀请用户助力,领狗粮.(需手动去做任务)
    if (item['taskType'] === 'InviteUser') {
      if (item['receiveStatus'] === 'chance_left') {
        console.log('未完成,需要自己手动去邀请好友给你助力,可以获得狗粮')
      } else if (item['receiveStatus'] === 'unreceive') {
        const InviteUser = await getFood('InviteUser');
        console.log(`领取助力后的狗粮结果::${JSON.stringify(InviteUser)}`);
      }
    }
    //每日三餐
    if (item['taskType'] === 'ThreeMeals') {
      console.log('-----每日三餐-----');
      if (item['receiveStatus'] === 'unreceive') {
        const ThreeMealsRes = await getFood('ThreeMeals');
        if (ThreeMealsRes.success) {
          if (ThreeMealsRes.errorCode === 'received') {
            console.log(`三餐结果领取成功`)
            message += `【三餐】领取成功，获得${ThreeMealsRes.data}g狗粮\n`;
          }
        }
      }
    }
    //关注店铺
    if (item['taskType'] === 'FollowShop') {
      console.log('-----关注店铺-----');
      const followShops = item.followShops;
      for (let shop of followShops) {
        if (!shop.status) {
          const followShopRes = await followShop(shop.shopId);
          console.log(`关注店铺${shop.name}结果::${JSON.stringify(followShopRes)}`)
        }
      }
    }
    //逛会场
    if (item['taskType'] === 'ScanMarket') {
      console.log('----逛会场----');
      const scanMarketList = item.scanMarketList;
      for (let scanMarketItem of scanMarketList) {
        if (!scanMarketItem.status) {
          const body = {
            "marketLink": scanMarketItem.marketLink,
            "taskType": "ScanMarket",
            "reqSource": "weapp"
          };
          const scanMarketRes = await scanMarket('scan', body);
          console.log(`逛会场-${scanMarketItem.marketName}结果::${JSON.stringify(scanMarketRes)}`)
        }
      }
    }
    //浏览频道
    if (item['taskType'] === 'FollowChannel') {
      console.log('----浏览频道----');
      const followChannelList = item.followChannelList;
      for (let followChannelItem of followChannelList) {
        if (!followChannelItem.status) {
          const body = {
            "channelId": followChannelItem.channelId,
            "taskType": "FollowChannel",
            "reqSource": "weapp"
          };
          const scanMarketRes = await scanMarket('scan', body);
          console.log(`浏览频道-${followChannelItem.channelName}结果::${JSON.stringify(scanMarketRes)}`)
        }
      }
    }
    //关注商品
    if (item['taskType'] === 'FollowGood') {
      console.log('----关注商品----');
      const followGoodList = item.followGoodList;
      for (let followGoodItem of followGoodList) {
        if (!followGoodItem.status) {
          const body = `sku=${followGoodItem.sku}&reqSource=h5`;
          const scanMarketRes = await scanMarket('followGood', body, 'application/x-www-form-urlencoded');
          // const scanMarketRes = await appScanMarket('followGood', `sku=${followGoodItem.sku}&reqSource=h5`, 'application/x-www-form-urlencoded');
          console.log(`关注商品-${followGoodItem.skuName}结果::${JSON.stringify(scanMarketRes)}`)
        }
      }
    }
    //看激励视频
    if (item['taskType'] === 'ViewVideo') {
      console.log('----浏览频道----');
      if (item.taskChance === joinedCount) {
        console.log('今日激励视频已看完')
      } else {
        for (let i = 0; i < new Array(item.taskChance - joinedCount).fill('').length; i++) {
          console.log(`开始第${i + 1}次看激励视频`);
          const body = {"taskType": "ViewVideo", "reqSource": "weapp"}
          let sanVideoRes = await scanMarket('scan', body);
          console.log(`看视频激励结果--${JSON.stringify(sanVideoRes)}`);
        }
      }
    }
  }
}

async function appPetTask() {
  await appGetPetTaskConfig();
  // console.log('$.appGetPetTaskConfigRes', $.appGetPetTaskConfigRes.success)
  if ($.appGetPetTaskConfigRes.success) {
    for (let item of $.appGetPetTaskConfigRes.datas) {
      if (item['taskType'] === 'ScanMarket' && item['receiveStatus'] === 'chance_left') {
        const scanMarketList = item.scanMarketList;
        for (let scan of scanMarketList) {
          if (!scan.status && scan.showDest === 'h5') {
            const body = {marketLink: scan.marketLinkH5, taskType: 'ScanMarket', reqSource: 'h5'}
            await appScanMarket('scan', body);
          }
        }
      }
    }
  }
}

function getDeskGoodDetails() {
  return new Promise(resolve => {
    const url = `${JD_API_HOST}/getDeskGoodDetails`;
    const host = `jdjoy.jd.com`;
    const reqSource = 'h5';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          data = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    })
  })
}

function followScan(sku) {
  return new Promise(resolve => {
    const url = `${JD_API_HOST}/scan`;
    const host = `jdjoy.jd.com`;
    const reqSource = 'h5';
    const body = {
      "taskType": "ScanDeskGood",
      "reqSource": "h5",
      sku
    }
    $.post(taskPostUrl(url, JSON.stringify(body), reqSource, host, 'application/json'), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          data = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    })
  })
}

//小程序逛会场，浏览频道，关注商品API
function scanMarket(type, body, cType = 'application/json') {
  return new Promise(resolve => {
    const url = `${weAppUrl}/${type}`;
    const host = `draw.jdfcloud.com`;
    const reqSource = 'weapp';
    if (cType === 'application/json') {
      body = JSON.stringify(body)
    }
    $.post(taskPostUrl(url, body, reqSource, host, cType), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          data = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    })
  })
}

//app逛会场
function appScanMarket(type, body) {
  return new Promise(resolve => {
    const url = `${JD_API_HOST}/${type}`;
    const host = `jdjoy.jd.com`;
    const reqSource = 'h5';
    $.post(taskPostUrl(url, JSON.stringify(body), reqSource, host, 'application/json'), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          // data = JSON.parse(data);
          console.log(`京东app逛会场结果::${data}`)
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    })
  })
}

//领取狗粮API
function getFood(type) {
  return new Promise(resolve => {
    const url = `${weAppUrl}/getFood?reqSource=weapp&taskType=${type}`;
    const host = `draw.jdfcloud.com`;
    const reqSource = 'weapp';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          data = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    })
  })
}

//关注店铺api
function followShop(shopId) {
  return new Promise(resolve => {
    const url = `${weAppUrl}/followShop`;
    const body = `shopId=${shopId}`;
    const reqSource = 'weapp';
    const host = 'draw.jdfcloud.com';
    $.post(taskPostUrl(url, body, reqSource, host, 'application/x-www-form-urlencoded'), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          data = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve(data);
      }
    })
  })
}

function enterRoom() {
  return new Promise(resolve => {
    const url = `${weAppUrl}/enterRoom?reqSource=weapp`;
    const host = `draw.jdfcloud.com`;
    const reqSource = 'weapp';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          // console.log('JSON.parse(data)', JSON.parse(data))

          $.roomData = JSON.parse(data);

          console.log(`现有狗粮: ${$.roomData.data.petFood}\n`)

          subTitle = `【用户名】${$.roomData.data.pin}`
          message = `现有积分: ${$.roomData.data.petCoin}\n现有狗粮: ${$.roomData.data.petFood}\n喂养次数: ${$.roomData.data.feedCount}\n宠物等级: ${$.roomData.data.petLevel}\n`
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    })
  })
}

function appGetPetTaskConfig() {
  return new Promise(resolve => {
    const url = `${JD_API_HOST}/getPetTaskConfig?reqSource=h5`;
    const host = `jdjoy.jd.com`;
    const reqSource = 'h5';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          // console.log('----', JSON.parse(data))
          $.appGetPetTaskConfigRes = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    })
  })
}

//喂食
function feedPets(feedNum) {
  return new Promise(resolve => {
    console.log(`您设置的喂食数量:${FEED_NUM}g\n`);
    console.log(`实际的喂食数量:${feedNum}g\n`);
    const url = `${weAppUrl}/feed?feedCount=${feedNum}&reqSource=weapp`;
    const host = `draw.jdfcloud.com`;
    const reqSource = 'weapp';
    $.get(taskUrl(url, host, reqSource), async (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          data = JSON.parse(data);
          if (data.success) {
            if (data.errorCode === 'feed_ok') {
              console.log('喂食成功')
              message += `【喂食成功】消耗${feedNum}g狗粮\n`;
            } else if (data.errorCode === 'time_error') {
              console.log('喂食失败：您的汪汪正在食用中,请稍后再喂食')
              message += `【喂食失败】您的汪汪正在食用中,请稍后再喂食\n`;
            } else if (data.errorCode === 'food_insufficient') {
              console.log(`当前喂食${feedNum}g狗粮不够, 现为您降低一档次喂食\n`)
              if ((feedNum) === 80) {
                feedNum = 40;
              } else if ((feedNum) === 40) {
                feedNum = 20;
              } else if ((feedNum) === 20) {
                feedNum = 10;
              } else if ((feedNum) === 10) {
                feedNum = 0;
              }
              // 如果喂食设置的数量失败, 就降低一个档次喂食.
              if ((feedNum) !== 0) {
                await feedPets(feedNum);
              } else {
                console.log('您的狗粮已不足10g')
                message += `【喂食失败】您的狗粮已不足10g\n`;
              }
            } else {
              console.log(`其他状态${data.errorCode}`)
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    })
  })
}

function getPetTaskConfig() {
  return new Promise(resolve => {
    const url = `${weAppUrl}/getPetTaskConfig?reqSource=weapp`;
    const host = `draw.jdfcloud.com`;
    const reqSource = 'weapp';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          // console.log('JSON.parse(data)', JSON.parse(data))
          $.getPetTaskConfigRes = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    })
  })
}

//查询赛跑信息API
function getPetRace() {
  return new Promise(resolve => {
    const url = `${JD_API_HOST}/combat/detail/v2?help=false`;
    const host = `jdjoy.jd.com`;
    const reqSource = 'h5';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          // console.log('查询赛跑信息API',(data))
          // $.appGetPetTaskConfigRes = JSON.parse(data);
          $.petRaceResult = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    })
  })
}

//参加赛跑API
function runMatch(teamLevel, timeout = 5000) {
  console.log(`正在参赛中，请稍等${timeout / 1000}秒，以防多个账号匹配到统一赛场\n`)
  return new Promise(async resolve => {
    await $.wait(timeout);
    const url = `${JD_API_HOST}/combat/match?teamLevel=${teamLevel}`;
    const host = `jdjoy.jd.com`;
    const reqSource = 'h5';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          // console.log('参加赛跑API', JSON.parse(data))
          // $.appGetPetTaskConfigRes = JSON.parse(data);
          $.runMatchResult = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    })
  })
}

//查询应援团信息API
function getBackupInfo() {
  return new Promise(resolve => {
    const url = `${JD_API_HOST}/combat/getBackupInfo`;
    const host = `jdjoy.jd.com`;
    const reqSource = 'h5';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          // console.log('查询应援团信息API',(data))
          // $.appGetPetTaskConfigRes = JSON.parse(data);
          $.getBackupInfoResult = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    })
  })
}

//领取赛跑奖励API
function receiveJoyRunAward() {
  return new Promise(resolve => {
    const url = `${JD_API_HOST}/combat/receive`;
    const host = `jdjoy.jd.com`;
    const reqSource = 'h5';
    $.get(taskUrl(url, host, reqSource), (err, resp, data) => {
      try {
        if (err) {
          console.log('\n京东宠汪汪: API查询请求失败 ‼️‼️')
        } else {
          // console.log('查询应援团信息API',(data))
          // $.appGetPetTaskConfigRes = JSON.parse(data);
          $.receiveJoyRunAwardRes = JSON.parse(data);
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    })
  })
}

function showMsg() {
  jdNotify = $.getdata('jdJoyNotify') ? $.getdata('jdJoyNotify') : jdNotify;
  if (!jdNotify || jdNotify === 'false') {
    $.msg($.name, subTitle, message);
  } else {
    $.log(`\n${message}\n`);
  }
}

function TotalBean() {
  return new Promise(async resolve => {
    const options = {
      "url": `https://wq.jd.com/user/info/QueryJDUserInfo?sceneval=2`,
      "headers": {
        "Accept": "application/json,text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "zh-cn",
        "Connection": "keep-alive",
        "Cookie": cookie,
        "Referer": "https://wqs.jd.com/my/jingdou/my.shtml?sceneval=2",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
      }
    }
    $.post(options, (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (data) {
            data = JSON.parse(data);
            if (data['retcode'] === 13) {
              $.isLogin = false; //cookie过期
              return
            }
            $.nickName = data['base'].nickname;
          } else {
            console.log(`京东服务器返回空数据`)
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}

function taskUrl(url, Host, reqSource) {
  return {
    url: url,
    headers: {
      'Cookie': cookie,
      'reqSource': reqSource,
      'Host': Host,
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'Referer': 'https://jdjoy.jd.com/pet/index',
      'User-Agent': 'jdapp;iPhone;8.5.8;13.4.1;9b812b59e055cd226fd60ebb5fd0981c4d0d235d;network/wifi;supportApplePay/3;hasUPPay/0;pushNoticeIsOpen/0;model/iPhone9,2;addressid/138109592;hasOCPay/0;appBuild/167169;supportBestPay/0;jdSupportDarkMode/0;pv/200.75;apprpd/MyJD_Main;ref/MyJdMTAManager;psq/29;ads/;psn/9b812b59e055cd226fd60ebb5fd0981c4d0d235d|608;jdv/0|direct|-|none|-|1587263154256|1587263330;adk/;app_device/IOS;pap/JA2015_311210|8.5.8|IOS 13.4.1;Mozilla/5.0 (iPhone; CPU iPhone OS 13_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1',
      'Accept-Language': 'zh-cn',
      'Accept-Encoding': 'gzip, deflate, br',
    }
  }
}

function taskPostUrl(url, body, reqSource, Host, ContentType) {
  return {
    url: url,
    body: body,
    headers: {
      'Cookie': cookie,
      'User-Agent': `Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1`,
      'reqSource': reqSource,
      'Content-Type': ContentType,
      'Host': Host,
      'Referer': 'https://jdjoy.jd.com/pet/index',
      'Accept-Language': 'zh-cn',
      'Accept-Encoding': 'gzip, deflate, br',
    }
  }
}