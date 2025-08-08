// 配置常量
const CONFIG = {
    LOG_DETAILS: false, // 是否开启响应日志
    STOP_DELAY: '0', // 自定义延迟签到，单位毫秒
    TIMEOUT: 0, // 接口超时退出，0则关闭
    TASK_COUNT: 5, // 任务执行次数
    DRAW_COUNT: 8, // 抽奖执行次数
    MIN_WAIT_TIME: 5000, // 最小等待时间
    MAX_WAIT_TIME: 10000, // 最大等待时间
    SKIP: false
};

// API配置
const API_CONFIG = {
    BASE_URL: 'https://apiv2.hichar.cn',
    ENDPOINTS: {
        USER_INFO: '/api/user/user/userInfo',
        SIGN: '/api/user/welfare/userSign',
        TASK: '/api/user/welfare/downWelfareJob',
        DRAW: '/api/user/welfare/draw',
        LOGIN: '/api/user/user/wechat-login',
        WELFARE_TASK_LIST: '/api/user/welfare/welfareTaskList',
        USER_WELFARE_POINTS: '/api/user/welfare/userWelfarePoints'
    }
};

// 默认请求头
const DEFAULT_HEADERS = {
    'Host': 'apiv2.hichar.cn',
    'accept': 'application/json',
    'xweb_xhr': '1',
    'appid': 'hichar.user.wxapp',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Mac MacWechat/WMPF MacWechat/3.8.7(0x13080712) UnifiedPCMacWechat(0xf26406f0) XWEB/14304',
    'content-type': 'application/json',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': 'https://servicewechat.com/wxc7548b3f7181e9d9/356/page-frame.html',
    'accept-language': 'zh-CN,zh;q=0.9',
    'priority': 'u=1, i'
};

// 全局变量
let $nobyda = nobyda();
let merge = {};
let KEY = '';
let USER = 0;

/**
 * 检查是否需要跳过执行
 */
function shouldSkip() {
    // 检查CONFIG.SKIP是否为true
    return CONFIG.SKIP === true;
}

/**
 * 主执行函数
 */
async function all(cookie) {
    try {
        KEY = cookie.token;
        USER = cookie.userId;
        merge = {};
        $nobyda.num++;

        // 执行签到流程
        await UserInfo("before");
        await MaoDouSign(0);

        // 重置任务完成标记
        merge.TASK_COMPLETED = false;
        await randomDelayTask(Wait(CONFIG.STOP_DELAY));

        // 重置抽奖积分不足标记
        merge.DRAW_INSUFFICIENT = false;
        await randomDelayDraw(Wait(CONFIG.STOP_DELAY));

        await UserInfo("after");
        await notify();
    } catch (error) {
        console.error('执行过程中发生错误:', error);
        $nobyda.AnError("主执行流程", "all", error);
    }
}

/**
 * 用户信息查询
 */
function UserInfo(name) {
    merge.TotalMoney = merge.TotalMoney || {};
    merge.MaoDouUserInfo = {}
    return new Promise(resolve => {
        // 检查是否需要跳过
        if (shouldSkip()) {
            console.log("\n跳过用户信息查询");
            resolve();
            return;
        }

        $nobyda.get({
            url: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_INFO}`,
            headers: {
                token: KEY,
                ...DEFAULT_HEADERS
            }
        }, (error, response, data) => {
            try {
                if (error) throw new Error(error);
                const result = JSON.parse(data);
                const details = CONFIG.LOG_DETAILS ? `response:\n${data}` : '';
                if (result.code === 0 && result.data) {
                    console.log(`\n毛豆充-查询成功 ${details}`);
                    merge.TotalMoney[name] = result.data.globalPoints;
                    merge.MaoDouUserInfo.notify = `毛豆充-查询成功，余额${result.data.globalPoints}`;
                    merge.MaoDouUserInfo.success = 1;
                } else if (result.code === 2004) {
                    console.log(`\n"毛豆充-查询失败 ${details}`);
                    CONFIG.SKIP = true;
                    merge.MaoDouUserInfo.notify = "毛豆充-查询失败, 原因: Token失效‼️";
                    merge.MaoDouUserInfo.fail = 1;
                } else {
                    console.log(`\n总现金查询失败 ${details}`);
                    merge.MaoDouUserInfo.notify = "毛豆充-查询失败";
                    merge.MaoDouUserInfo.fail = 1;
                }
            } catch (error) {
                $nobyda.AnError("账户现金-查询", "TotalMoney", error, response, data);
            } finally {
                resolve();
            }
        });

        if (CONFIG.TIMEOUT) setTimeout(resolve, CONFIG.TIMEOUT);
    });
}

/**
 * 获取任务列表并计算循环次数
 */
function getWelfareTaskList() {
    return new Promise(resolve => {
        // 检查是否需要跳过
        if (shouldSkip()) {
            console.log("\n跳过获取任务列表");
            resolve(0);
            return;
        }

        $nobyda.post({
            url: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.WELFARE_TASK_LIST}`,
            headers: {
                token: KEY,
                ...DEFAULT_HEADERS
            },
            body: JSON.stringify({
                userId: USER
            })
        }, (error, response, data) => {
            try {
                if (error) throw new Error(error);
                const result = JSON.parse(data);
                const details = CONFIG.LOG_DETAILS ? `response:\n${data}` : '';

                if (result.code === 0 && result.data && result.data) {
                    console.log(`\n获取任务列表成功 ${details}`);

                    // 查找taskId为1的任务
                    const task1 = result.data.find(task => task.taskId === 1);
                    if (task1) {
                        const remainingTimes = Math.max(0, task1.limitTimes - task1.nowTimes);
                        console.log(`\n任务1剩余次数: ${remainingTimes} (limitTimes: ${task1.limitTimes}, nowTimes: ${task1.nowTimes})`);
                        resolve(remainingTimes);
                    } else {
                        console.log("\n未找到taskId为1的任务");
                        resolve(0);
                    }
                } else if (result.code === 2004) {
                    console.log(`\n获取任务列表失败，Token失效 ${details}`);
                    CONFIG.SKIP = true;
                    resolve(0);
                } else {
                    console.log(`\n获取任务列表失败，code: ${result.code}, msg: ${result.msg || result.message} ${details}`);
                    resolve(0);
                }
            } catch (error) {
                $nobyda.AnError("获取任务列表", "WelfareTaskList", error, response, data);
                resolve(0);
            }
        });

        if (CONFIG.TIMEOUT) setTimeout(() => resolve(0), CONFIG.TIMEOUT);
    });
}

/**
 * 根据当前日期计算签到所需的积分
 */
function getDrawPointsByDay() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0是周日，1是周一，2是周二，...，6是周六

    // 周一到周日的签到积分配置：1000, 1100, 1200, 1300, 1400, 1800, 2500
    const pointsByDay = {
        1: 1000, // 周一
        2: 1100, // 周二
        3: 1200, // 周三
        4: 1300, // 周四
        5: 1400, // 周五
        6: 1800, // 周六
        0: 2500  // 周日
    };

    const points = pointsByDay[dayOfWeek] || 1000; // 默认1000
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    console.log(`\n当前日期: ${today.toLocaleDateString()}, 星期${weekDays[dayOfWeek]}, 签到所需积分: ${points}`);

    return points;
}

/**
 * 获取用户福利积分并计算可抽奖次数
 */
function getUserWelfarePoints() {
    return new Promise(resolve => {
        // 检查是否需要跳过
        if (shouldSkip()) {
            console.log("\n跳过获取用户福利积分");
            resolve(0);
            return;
        }

        $nobyda.get({
            url: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_WELFARE_POINTS}?userId=${USER}`,
            headers: {
                token: KEY,
                ...DEFAULT_HEADERS
            }
        }, (error, response, data) => {
            try {
                if (error) throw new Error(error);
                const result = JSON.parse(data);
                const details = CONFIG.LOG_DETAILS ? `response:\n${data}` : '';

                if (result.code === 0 && result.data && typeof result.data.points === 'number') {
                    const points = result.data.points;
                    const drawCount = Math.max(0, Math.floor(points / 1000)); // 使用固定的1000积分
                    console.log(`\n获取用户福利积分成功，积分: ${points}, 可抽奖次数: ${drawCount} ${details}`);
                    resolve(drawCount);
                } else if (result.code === 2004) {
                    console.log(`\n获取用户福利积分失败，Token失效 ${details}`);
                    CONFIG.SKIP = true;
                    resolve(0);
                } else {
                    console.log(`\n获取用户福利积分失败，code: ${result.code}, msg: ${result.msg || result.message} ${details}`);
                    resolve(0);
                }
            } catch (error) {
                $nobyda.AnError("获取用户福利积分", "UserWelfarePoints", error, response, data);
                resolve(0);
            }
        });

        if (CONFIG.TIMEOUT) setTimeout(() => resolve(0), CONFIG.TIMEOUT);
    });
}

/**
 * 通知函数
 */
function notify() {
    return new Promise(resolve => {
        try {
            let success = 0;
            let fail = 0;
            let err = 0;
            let notifyMessage = '';

            for (const key in merge) {
                const item = merge[key];
                success += item.success ? Number(item.success) : 0;
                fail += item.fail ? Number(item.fail) : 0;
                err += item.error ? Number(item.error) : 0;
                notifyMessage += item.notify ? `\n${item.notify}` : '';
            }

            const beforeMoney = merge.TotalMoney?.before || 0;
            const afterMoney = merge.TotalMoney?.after || 0;

            let finalMessage = `今天成功${success}个接口，失败${fail}个接口，执行前余额：${beforeMoney}，执行后余额：${afterMoney}${notifyMessage}`;

            // 如果检测到SKIP状态，在消息开头添加提示
            if (shouldSkip()) {
                finalMessage = `⚠️ 检测到Token失效，已跳过后续操作\n${finalMessage}`;
            }
            $nobyda.notify("", "", finalMessage, {
                'media-url': $nobyda.headUrl || 'https://cdn.jsdelivr.net/gh/NobyDa/mini@master/Color/jd.png'
            });
        } catch (error) {
            $nobyda.notify("通知模块 " + error.name + "‼️", JSON.stringify(error), error.message);
        } finally {
            resolve();
        }
    });
}

/**
 * 毛豆充签到
 */
function MaoDouSign(delay) {
    merge.MaoDouSign = {};
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    const points = getDrawPointsByDay(); // 获取当前日期所需的积分

    return new Promise(resolve => {
        // 检查是否需要跳过
        if (shouldSkip()) {
            console.log("\n跳过毛豆充签到");
            resolve();
            return;
        }

        setTimeout(() => {
            const signData = {
                url: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SIGN}`,
                headers: {
                    token: KEY,
                    ...DEFAULT_HEADERS
                },
                body: JSON.stringify({
                    signDate: formattedDate,
                    points: points,
                    userId: USER,
                    consecutiveDays: 0
                })
            };

            $nobyda.post(signData, (error, response, data) => {
                try {
                    if (error) throw new Error(error);

                    const result = JSON.parse(data);
                    const details = CONFIG.LOG_DETAILS ? `response:\n${data}` : '';

                    if (result.code === 2004) {
                        console.log(`\n毛豆充Token失效 ${details}`);
                        CONFIG.SKIP = true;
                        merge.MaoDouSign.notify = "毛豆充-签到失败, 原因: Token失效‼️";
                        merge.MaoDouSign.fail = 1;
                    } else if (result.code === 0) {
                        merge.MaoDouSign.notify = `毛豆充-签到成功，获得积分: ${points}`;
                        merge.MaoDouSign.success = 1;
                        console.log(`\n毛豆充-签到成功，获得积分: ${points}`);
                    } else if (result.code === -1) {
                        merge.MaoDouSign.notify = "毛豆充-签到成功，今日已签到";
                        merge.MaoDouSign.success = 1;
                        console.log("\n毛豆充-今日已签到");
                    } else {
                        merge.MaoDouSign.fail = 1;
                        console.log(`\n毛豆充-签到失败 ${details}`);
                    }
                } catch (error) {
                    $nobyda.AnError("毛豆充-签到", "MaoDouSign", error, response, data);
                } finally {
                    resolve();
                }
            });
        }, delay);

        if (CONFIG.TIMEOUT) setTimeout(resolve, CONFIG.TIMEOUT + delay);
    });
}

/**
 * 获取随机等待时间
 */
function getRandomWaitTime(minTime = CONFIG.MIN_WAIT_TIME) {
    return Math.floor(Math.random() * (CONFIG.MAX_WAIT_TIME - minTime)) + minTime;
}

/**
 * 随机延迟任务执行
 */
async function randomDelayTask(delay) {
    // 检查是否需要跳过
    if (shouldSkip()) {
        console.log("\n跳过随机延迟任务执行");
        return;
    }

    // 获取任务列表并计算循环次数
    const taskCount = await getWelfareTaskList();

    if (taskCount === 0) {
        console.log("\n任务已完成或获取失败，跳过任务执行");
        return;
    }

    console.log(`\n开始执行任务，剩余次数: ${taskCount}`);

    // 改为顺序执行，这样可以及时检测到任务完成状态
    for (let i = 0; i < taskCount; i++) {
        // 每次循环前检查是否需要跳过
        if (shouldSkip()) {
            console.log(`\n检测到Token失效，跳过剩余任务（${i}/${taskCount}）`);
            break;
        }

        // 检查任务是否已完成
        if (merge.TASK_COMPLETED) {
            console.log(`\n检测到任务已完成，跳过剩余任务（${i}/${taskCount}）`);
            break;
        }

        const waitTime = getRandomWaitTime();
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // 等待当前任务完成
        await MaoDouTask(delay, i);
    }
}

/**
 * 毛豆充任务
 */
function MaoDouTask(delay, index) {
    merge.MaoDouTask = merge.MaoDouTask || {};

    return new Promise(resolve => {
        // 检查是否需要跳过
        if (shouldSkip()) {
            console.log(`\n跳过毛豆充任务${index}`);
            resolve();
            return;
        }

        setTimeout(() => {
            const taskData = {
                url: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TASK}`,
                headers: {
                    token: KEY,
                    ...DEFAULT_HEADERS
                },
                body: JSON.stringify({
                    taskId: 1,
                    taskName: "观看视频",
                    points: 1000,
                    userId: USER,
                    status: 0,
                    drawType: 0,
                    reachTimes: index,
                    nowTimes: index,
                    limitTime: 5,
                    otherJson: null
                })
            };

            $nobyda.post(taskData, (error, response, data) => {
                try {
                    if (error) throw new Error(error);

                    const result = JSON.parse(data);
                    const details = CONFIG.LOG_DETAILS ? `response:\n${data}` : '';

                    if (result.code === 2004) {
                        console.log(`\n毛豆充Token失效 ${details}`);
                        CONFIG.SKIP = true;
                        merge.MaoDouTask.notify = "毛豆充-任务失败, 原因: Token失效‼️";
                        merge.MaoDouTask.fail = 1;
                    } else if (result.code === 0) {
                        merge.MaoDouTask.notify = `毛豆充-任务${index}成功`;
                        merge.MaoDouTask.success = 1;
                        console.log(`\n毛豆充-任务${index}成功`);
                    } else if (result.code === -1) {
                        // 任务不可重复完成，跳过后续任务
                        console.log(`\n毛豆充-任务${index}不可重复完成，跳过后续任务`);
                        merge.MaoDouTask.notify = `毛豆充-任务${index}不可重复完成`;
                        merge.MaoDouTask.success = 1;
                        // 设置一个标记，让randomDelayTask知道要跳过后续循环
                        merge.TASK_COMPLETED = true;
                    } else {
                        merge.MaoDouTask.fail = 1;
                        console.log(`\n毛豆充-任务${index}失败 ${details}`);
                    }
                } catch (error) {
                    $nobyda.AnError("毛豆充-任务", "MaoDouTask", error, response, data);
                } finally {
                    resolve();
                }
            });
        }, delay);

        if (CONFIG.TIMEOUT) setTimeout(resolve, CONFIG.TIMEOUT + delay);
    });
}

/**
 * 随机延迟抽奖执行
 */
async function randomDelayDraw(delay) {
    // 检查是否需要跳过
    if (shouldSkip()) {
        console.log("\n跳过随机延迟抽奖执行");
        return;
    }

    // 获取用户福利积分并计算可抽奖次数
    const drawCount = await getUserWelfarePoints();

    if (drawCount === 0) {
        console.log("\n积分不足或获取失败，跳过抽奖执行");
        return;
    }

    console.log(`\n开始执行抽奖，可抽奖次数: ${drawCount}`);

    // 改为顺序执行，这样可以及时检测到积分不足状态
    for (let i = 0; i < drawCount; i++) {
        // 每次循环前检查是否需要跳过
        if (shouldSkip()) {
            console.log(`\n检测到Token失效，跳过剩余抽奖（${i}/${drawCount}）`);
            break;
        }

        // 检查积分是否不足
        if (merge.DRAW_INSUFFICIENT) {
            console.log(`\n检测到积分不足，跳过剩余抽奖（${i}/${drawCount}）`);
            break;
        }

        const waitTime = getRandomWaitTime(0);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // 等待当前抽奖完成
        await MaoDouDraw(delay, i);
    }
}

/**
 * 毛豆充抽奖
 */
function MaoDouDraw(delay, index) {
    merge.MaoDouDraw = merge.MaoDouDraw || {};

    return new Promise(resolve => {
        // 检查是否需要跳过
        if (shouldSkip()) {
            console.log(`\n跳过毛豆充抽奖${index}`);
            resolve();
            return;
        }

        setTimeout(() => {
            const drawData = {
                url: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DRAW}`,
                headers: {
                    token: KEY,
                    ...DEFAULT_HEADERS
                }
            };

            $nobyda.post(drawData, (error, response, data) => {
                try {
                    if (error) throw new Error(error);

                    const result = JSON.parse(data);
                    const details = CONFIG.LOG_DETAILS ? `response:\n${data}` : '';

                    if (result.code === 2004) {
                        CONFIG.SKIP = true;
                        console.log(`\n毛豆充Token失效 ${details}`);
                        merge.MaoDouDraw.notify = "毛豆充-抽奖失败, 原因: Token失效‼️";
                        merge.MaoDouDraw.fail = 1;
                    } else if (result.code === 0) {
                        merge.MaoDouDraw.notify = `毛豆充-抽奖${index}成功`;
                        merge.MaoDouDraw.success = 1;
                        console.log(`\n毛豆充-抽奖${index}成功`);
                    } else if (result.code === -1) {
                        // 积分不足，跳过后续抽奖
                        console.log(`\n毛豆充-抽奖${index}积分不足，跳过后续抽奖`);
                        merge.MaoDouDraw.notify = `毛豆充-抽奖${index}积分不足`;
                        merge.MaoDouDraw.success = 1;
                        // 设置一个标记，让randomDelayDraw知道要跳过后续循环
                        merge.DRAW_INSUFFICIENT = true;
                    } else {
                        merge.MaoDouDraw.fail = 1;
                        console.log(`\n毛豆充-抽奖${index}失败 ${details}`);
                    }
                } catch (error) {
                    $nobyda.AnError("毛豆充-抽奖", "MaoDouDraw", error, response, data);
                } finally {
                    resolve();
                }
            });
        }, delay);

        if (CONFIG.TIMEOUT) setTimeout(resolve, CONFIG.TIMEOUT + delay);
    });
}

/**
 * 等待时间计算
 */
function Wait(readDelay, isInit = false) {
    if (!readDelay || readDelay === '0') return 0;

    if (typeof readDelay === 'string') {
        const cleanDelay = readDelay.replace(/"|＂|'|＇/g, '');
        if (!cleanDelay.includes('-')) return parseInt(cleanDelay) || 0;

        const [min, max] = cleanDelay.split("-").map(Number);
        const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;

        if (isInit) {
            console.log(`\n初始化随机延迟: 最小${min / 1000}秒, 最大${max / 1000}秒`);
        }

        return isInit ? readDelay : randomTime;
    } else if (typeof readDelay === 'number') {
        return readDelay > 0 ? readDelay : 0;
    }

    return 0;
}

/**
 * 获取Cookie
 */
function GetCookie() {
    const req = $request;
    if (!req || req.method === 'OPTIONS') return;
    try {
        const url = req.url || '';
        // 解析正文
        let parsed = null;
        if (hasRespObj) {
            parsed = req.response;
        } else if (hasRespStr) {
            try {
                parsed = JSON.parse(req.response);
            } catch (_) {
                parsed = null;
            }
        } else if (hasBodyObj) {
            parsed = req.body;
        } else if (hasBodyStr) {
            try {
                parsed = JSON.parse(req.body);
            } catch (_) {
                parsed = null;
            }
        }

        let userId = 0;
        let token = '';

        if (/https:\/\/apiv2\.hichar\.cn\/api\/user\/user\/wechat-login/.test(url) && parsed) {
            userId = parsed?.data?.user?.id || 0;
            token = parsed?.data?.token || '';
        } else if (/https:\/\/apiv2\.hichar\.cn\/api\/user\/user\/userInfo/.test(url)) {
            if (parsed) {
                userId = parsed?.data?.user?.id || 0;
            }
            token = req.headers?.token || req.headers?.Token || '';
        }
        $nobyda.notify('GetCookie', '', `token: ${token}`);

        if (userId && token) {
            const tokenData = {userId, token};
            const writeResult = $nobyda.write(JSON.stringify(tokenData, null, 2), 'Cookies');
            $nobyda.notify(`用户名: ${userId}`, '', `写入[账号${userId}] Token ${writeResult ? '成功 🎉' : '失败 ‼️'}`);
        }
    } catch (e) {
        $nobyda.notify('GetCookie', '', e?.message || String(e));
    }
}

/**
 * 主程序入口
 */
(async function ReadCookie() {
    try {
        const cookiesInfo = "Cookies";
        const cookiesData = $nobyda.read(cookiesInfo);
        if ($nobyda.isRequest) {
            GetCookie();
        } else if (cookiesData) {
            // 解析cookies数据
            let cookies;
            try {
                cookies = typeof cookiesData === 'string' ? JSON.parse(cookiesData) : cookiesData;
            } catch (error) {
                console.error('解析Cookies数据失败:', error);
                throw new Error('Cookie数据格式错误');
            }

            // 读取配置
            const timeout = parseInt($nobyda.read("TimeOut")) || CONFIG.TIMEOUT;
            const delay = Wait($nobyda.read("Delay"), true) || Wait(CONFIG.STOP_DELAY, true);
            const logDetails = $nobyda.read("Log") === "true" || CONFIG.LOG_DETAILS;

            // 更新配置
            CONFIG.TIMEOUT = timeout;
            CONFIG.STOP_DELAY = delay;
            CONFIG.LOG_DETAILS = logDetails;

            $nobyda.num = 0;

            if (cookies && cookies.token) {
                await all(cookies);
            } else {
                throw new Error('Cookie中缺少token信息');
            }

            $nobyda.time();
        } else {
            throw new Error('脚本终止, 未获取Cookie ‼️');
        }
    } catch (error) {
        $nobyda.notify("毛豆充签到", "", error.message || JSON.stringify(error));
    } finally {
        if ($nobyda.isJSBox) $intents.finish($nobyda.st);
        $nobyda.done();
    }
})();

/**
 * nobyda工具函数
 */
function nobyda() {
    const start = Date.now();
    const isRequest = typeof $request !== "undefined";
    const isSurge = typeof $httpClient !== "undefined";
    const isQuanX = typeof $task !== "undefined";
    const isLoon = typeof $loon !== "undefined";
    const isJSBox = typeof $app !== "undefined" && typeof $http !== "undefined";
    const isNode = typeof require === "function" && !isJSBox;
    const NodeSet = 'MaoDouSet.json';

    const node = (() => {
        if (isNode) {
            const request = require('request');
            const fs = require("fs");
            const path = require("path");
            return {request, fs, path};
        }
        return null;
    })();

    const notify = (title, subtitle, message, rawopts) => {
        const Opts = (rawopts) => {
            if (!rawopts) return rawopts;

            if (typeof rawopts === 'string') {
                if (isLoon) return rawopts;
                else if (isQuanX) return {'open-url': rawopts};
                else if (isSurge) return {url: rawopts};
                else return undefined;
            } else if (typeof rawopts === 'object') {
                if (isLoon) {
                    const openUrl = rawopts.openUrl || rawopts.url || rawopts['open-url'];
                    const mediaUrl = rawopts.mediaUrl || rawopts['media-url'];
                    return {openUrl, mediaUrl};
                } else if (isQuanX) {
                    const openUrl = rawopts['open-url'] || rawopts.url || rawopts.openUrl;
                    const mediaUrl = rawopts['media-url'] || rawopts.mediaUrl;
                    return {'open-url': openUrl, 'media-url': mediaUrl};
                } else if (isSurge) {
                    const openUrl = rawopts.url || rawopts.openUrl || rawopts['open-url'];
                    return {url: openUrl};
                }
            }
            return undefined;
        };

        console.log(`${title}\n${subtitle}\n${message}`);
        if (isQuanX) $notify(title, subtitle, message, Opts(rawopts));
        if (isSurge) $notification.post(title, subtitle, message, Opts(rawopts));
        if (isJSBox) $push.schedule({
            title: title,
            body: subtitle ? subtitle + "\n" + message : message
        });
    };

    const write = (value, key) => {
        if (isQuanX) return $prefs.setValueForKey(value, key);
        if (isSurge) return $persistentStore.write(value, key);
        if (isNode) {
            try {
                const filePath = node.path.resolve(__dirname, NodeSet);
                if (!node.fs.existsSync(filePath)) {
                    node.fs.writeFileSync(filePath, JSON.stringify({}));
                }
                const dataValue = JSON.parse(node.fs.readFileSync(filePath));
                if (value) dataValue[key] = value;
                if (!value) delete dataValue[key];
                return node.fs.writeFileSync(filePath, JSON.stringify(dataValue));
            } catch (error) {
                return AnError('Node.js持久化写入', null, error);
            }
        }
        if (isJSBox) {
            if (!value) return $file.delete(`shared://${key}.txt`);
            return $file.write({
                data: $data({string: value}),
                path: `shared://${key}.txt`
            });
        }
    };

    const read = (key) => {
        if (isQuanX) return $prefs.valueForKey(key);
        if (isSurge) return $persistentStore.read(key);
        if (isNode) {
            try {
                const filePath = node.path.resolve(__dirname, NodeSet);
                if (!node.fs.existsSync(filePath)) return null;
                const dataValue = JSON.parse(node.fs.readFileSync(filePath));
                return dataValue[key];
            } catch (error) {
                return AnError('Node.js持久化读取', null, error);
            }
        }
        if (isJSBox) {
            if (!$file.exists(`shared://${key}.txt`)) return null;
            return $file.read(`shared://${key}.txt`).string;
        }
    };

    const adapterStatus = (response) => {
        if (response) {
            if (response.status) {
                response.statusCode = response.status;
            } else if (response.statusCode) {
                response.status = response.statusCode;
            }
        }
        return response;
    };

    const get = (options, callback) => {
        options.headers = options.headers || {};
        if (isQuanX) {
            if (typeof options === "string") options = {url: options};
            options.method = "GET";
            $task.fetch(options).then(response => {
                callback(null, adapterStatus(response), response.body);
            }, reason => callback(reason.error, null, null));
        }
        if (isSurge) {
            options.headers['X-Surge-Skip-Scripting'] = false;
            $httpClient.get(options, (error, response, body) => {
                callback(error, adapterStatus(response), body);
            });
        }
        if (isNode) {
            node.request(options, (error, response, body) => {
                callback(error, adapterStatus(response), body);
            });
        }
        if (isJSBox) {
            if (typeof options === "string") options = {url: options};
            options.header = options.headers;
            options.handler = function (resp) {
                let error = resp.error;
                if (error) error = JSON.stringify(resp.error);
                let body = resp.data;
                if (typeof body === "object") body = JSON.stringify(resp.data);
                callback(error, adapterStatus(resp.response), body);
            };
            $http.get(options);
        }
    };

    const post = (options, callback) => {
        options.headers = options.headers || {};
        options.headers['User-Agent'] = 'JD4iPhone/167169 (iPhone; iOS 13.4.1; Scale/3.00)';
        if (options.body) {
            // 检查body是否为JSON字符串，如果是则设置Content-Type为application/json
            if (typeof options.body === 'string' && (options.body.startsWith('{') || options.body.startsWith('['))) {
                options.headers['Content-Type'] = 'application/json';
            } else {
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        }

        if (isQuanX) {
            if (typeof options === "string") options = {url: options};
            options.method = "POST";
            $task.fetch(options).then(response => {
                callback(null, adapterStatus(response), response.body);
            }, reason => callback(reason.error, null, null));
        }
        if (isSurge) {
            options.headers['X-Surge-Skip-Scripting'] = false;
            $httpClient.post(options, (error, response, body) => {
                callback(error, adapterStatus(response), body);
            });
        }
        if (isNode) {
            node.request.post(options, (error, response, body) => {
                callback(error, adapterStatus(response), body);
            });
        }
        if (isJSBox) {
            if (typeof options === "string") options = {url: options};
            options.header = options.headers;
            options.handler = function (resp) {
                let error = resp.error;
                if (error) error = JSON.stringify(resp.error);
                let body = resp.data;
                if (typeof body === "object") body = JSON.stringify(resp.data);
                callback(error, adapterStatus(resp.response), body);
            };
            $http.post(options);
        }
    };

    const AnError = (name, keyname, error, resp, body) => {
        if (typeof merge !== "undefined" && keyname) {
            if (!merge[keyname].notify) {
                merge[keyname].notify = `${name}: 异常, 已输出日志 ‼️`;
            } else {
                merge[keyname].notify += `\n${name}: 异常, 已输出日志 ‼️ (2)`;
            }
            merge[keyname].error = 1;
        }
        return console.log(`\n‼️${name}发生错误\n‼️名称: ${error.name}\n‼️描述: ${error.message}${JSON.stringify(error).match(/\"line\"/) ? `\n‼️行列: ${JSON.stringify(error)}` : ``}${resp && resp.status ? `\n‼️状态: ${resp.status}` : ``}${body ? `\n‼️响应: ${resp && resp.status != 503 ? body : `Omit.`}` : ``}`);
    };

    const time = () => {
        const end = ((Date.now() - start) / 1000).toFixed(2);
        return console.log('\n签到用时: ' + end + ' 秒');
    };

    const done = (value = {}) => {
        if (isQuanX) return $done(value);
        if (isSurge) return isRequest ? $done(value) : $done();
    };

    return {
        AnError,
        isRequest,
        isJSBox,
        isSurge,
        isQuanX,
        isLoon,
        isNode,
        notify,
        write,
        read,
        get,
        post,
        time,
        done
    };
}
