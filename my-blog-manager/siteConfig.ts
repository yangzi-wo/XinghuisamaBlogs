// siteConfig.ts - 你的全站“控制中心”

export const siteConfig = {
  // 1. 网站标题与博主信息
  title: "样子の巴别塔",
  faviconUrl: "/avatar.jpg",
  authorName: "样子",
  bio: "「烏の歌に茜 この孤独も今音に変わる」",

  navTitle: "样子",

  // 👇 【新增】导航栏中间的那个后缀/分隔符（默认是 の）
  navSuffix: "の",

  navAfter: "巴别塔",

  // 2. 头像设置 (支持网络链接，或将图片放入 public 文件夹后使用 "/me.jpg")
  avatarUrl: "/avatar.jpg",

  // 3. 网站背景设置 (二选一)
  // 如果想用纯图片背景，请在下面 bgImage 写路径，并将 useGradient 设为 false
  useGradient: false,
  themeColors: ["#a18cd1", "#fbc2eb", "#a1c4fd", "#c2e9fb"], // 呼吸流动的颜色组合
// 修改这里：变成图片数组
  bgImages: ["/backgrounds/bg-1.jpg", "/backgrounds/bg-2.jpg", "/backgrounds/bg-3.jpg", "/backgrounds/bg-4.jpg"],

  // 🌟 壁纸分组系统：前台轮播「激活分组」内的图片（保持 JSON 格式，便于后台解析）
  bgGroups: [{"id": "default", "name": "默认", "images": ["/backgrounds/bg-1.jpg", "/backgrounds/bg-2.jpg", "/backgrounds/bg-3.jpg", "/backgrounds/bg-4.jpg"]}],
  activeBgGroup: "default",

  // 4. 文章默认封面图 (当 Markdown 没写 cover 时显示)
  defaultPostCover: "",

  // 5. 首页照片墙预览图
  photoWallImage: "",
  cloudMusicIds: [] as string[],
  localTracks: [{"id": "local_1795514121095", "title": "花も騒めく", "artist": "ヨルシカ", "src": "/music/1795514121095_Hi-Res.mp3", "cover": "/music/1795514121095_178201173.jpg", "lrcUrl": "/music/1795514121095_-.lrc"}, {"id": "local_1795568545836", "title": "又三郎", "artist": "ヨルシカ", "src": "/music/1795568545836_MV_____n-buna___suis.mp3", "cover": "/music/1795568545836_kg_1795568422802.jpg", "lrcUrl": "/music/1795568545836_lyric.lrc"}, {"id": "local_1795615158152", "title": "八月、某、月明かり", "artist": "ヨルシカ", "src": "/music/1795615158152_Hi-Res______________-_____Yorushika.mp3", "cover": "/music/1795615158152_22195309.jpg", "lrcUrl": "/music/1795615158152_lyric.lrc"}, {"id": "local_1795616340698", "title": "アポリア", "artist": "ヨルシカ", "src": "/music/1795616340698_Hi-Res_____________-______Yorushika.mp3", "cover": "/music/1795616340698_105645570.jpg", "lrcUrl": "/music/1795616340698_lyric.lrc"}, {"id": "local_1795617284268", "title": "白金ディスコ", "artist": "井口裕香", "src": "/music/1795617284268_disco_____MV_______________OP.mp3", "cover": "/music/1795617284268_32170955.jpg", "lrcUrl": "/music/1795617284268_disco.lrc"}, {"id": "local_1795695468629", "title": "三月と狼少年", "artist": "初音ミク", "src": "/music/1795695468629_n-buna.mp3", "cover": "/music/1795695468629_1831798.jpg", "lrcUrl": "/music/1795695468629_lyric.lrc"}, {"id": "local_1795695589228", "title": "ラプンツェル", "artist": "初音ミク", "src": "/music/1795695589228_Dark__________n-buna.mp3", "cover": "/music/1795695589228_1831798.jpg", "lrcUrl": "/music/1795695589228_lyric.lrc"}, {"id": "local_1795695732501", "title": "カワユイ星", "artist": "初音ミク", "src": "/music/1795695732501_NAYUTAN___-______________ft_______NOT_OF.mp3", "cover": "/music/1795695732501_154312297.jpg", "lrcUrl": "/music/1795695732501_-.lrc"}, {"id": "local_1795695929485", "title": "リバースユニバース", "artist": "初音ミク", "src": "/music/1795695929485_pending-1796280415-___________________PV.mp3", "cover": "/music/1795695929485_19220202.jpg", "lrcUrl": "/music/1795695929485_lyric.lrc"}, {"id": "local_1795696737600", "title": "少女レイ", "artist": "初音ミク", "src": "/music/1795696737600_PV________Rei_feat______Mikito_P.mp3", "cover": "/music/1795696737600_77321153.jpg", "lrcUrl": "/music/1795696737600_-_MikitoP_____P.lrc"}, {"id": "local_1795874387157", "title": "七月、影法師、藍色、ロッカー", "artist": "GUMI&miki", "src": "/music/1795874387157_GUMI_miki________________n-buna.mp3", "cover": "/music/1795874387157_661805.jpg", "lrcUrl": "/music/1795874387157_lyric.lrc"}, {"id": "local_1795875233586", "title": "花降らし", "artist": "初音ミク", "src": "/music/1795875233586_n-buna.mp3", "cover": "/music/1795875233586_1831798.jpg", "lrcUrl": "/music/1795875233586_lyric.lrc"}, {"id": "local_1795875725696", "title": "もうじき夏が終わるから", "artist": "初音ミク", "src": "/music/1795875725696_--n-buna.mp3", "cover": "/music/1795875725696_661806.jpg", "lrcUrl": "/music/1795875725696_lyric.lrc"}, {"id": "local_1795876163891", "title": "着火、カウントダウン", "artist": "miki", "src": "/music/1795876163891_miki_n-buna__-.mp3", "cover": "/music/1795876163891_661806.jpg", "lrcUrl": "/music/1795876163891_lyric.lrc"}, {"id": "local_1795876725230", "title": "拝啓、夏に溺れる", "artist": "初音ミク", "src": "/music/1795876725230_track.mp3", "cover": "/music/1795876725230_661806.jpg", "lrcUrl": "/music/1795876725230_lyric.lrc"}] as { id: string; title: string; artist: string; src: string; cover?: string; lrcUrl?: string }[],
  social: {
    github: "https://github.com/yangzi-wo",
    discord: "https://discord.com/users/1511869707916152885",
    x: "https://x.com/Yangzi_wo",
    telegram: "t.me/yangzi_wo",
    email: "yzi606999@gmail.com",
    qq: "2829415774",
  },
  counts: {
    photos: 0, // 照片墙数量可以手动写死或动态计算
  },
  chatterTitle: "云端杂谈", // 你可以改成任何你喜欢的名字
  chatterDescription: "碎片记录",

  // 👇 【新增】：图床核心配置 (PicBed Configuration)
  picBedName: "图床",
  picBedUrl: "", // 默认的 Lsky Pro API 地址
  picBedToken: "", // 留空，等你能在后台填入并覆写

  // 👇 【新增】：全局背景弹幕配置
  danmakuList: ["FAZE UP！！！", "前端你发力吧", "夏天", "红楼一梦", "神曲", "献给阿尔吉侬的花束", "赞美太阳！！！", "baka", "你是朋友", "存活千年", "你说得对，但是...", "也吹落了酸木梨", "吹落了青核桃", "狂风肆虐", "火之渐熄，然位不见王影", "你不是对手！", "折返吧...", "居然是菇...", "卡了", "在干嘛呢？", "有笨蛋嘛？", "前方高能反应！", "MD 模拟什么时候才能出图啊", "BUG 修复进度 99%", "今天背单词了吗？", "写算法中", "睡大觉中", "到底在干嘛？"],
  gitalkConfig: {
    clientID: "",
    clientSecret: "",
    repo: "",
    owner: "",
    admin: [""],
  },
  buildDate: "2026-11-23T00:00:00", // 建站日期
  footerBadges: [{"name": "Next.js 15", "color": "text-sky-500", "svg": "<path d=\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z\"/>"}, {"name": "React 19", "color": "text-cyan-400", "svg": "<path d=\"M12 22.6l-9.8-5.6V5.6L12 0l9.8 5.6v11.4l-9.8 5.6zm-8.2-6.5l8.2 4.7 8.2-4.7V7.5L12 2.8 3.8 7.5v8.6z\"/>"}, {"name": "Tailwind 4", "color": "text-teal-400", "svg": "<path d=\"M12.001,4.8c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624C13.666,10.618,15.027,12,18.001,12 c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624C16.337,6.182,14.976,4.8,12.001,4.8z M6.001,12c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624c1.177,1.194,2.538,2.576,5.512,2.576 c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624C10.337,13.382,8.976,12,6.001,12z\"/>"}],
  icpConfig: null as { name: string; link: string } | null,
  geminiConfig: {
    modelId: "gemini-2.5-flash-lite",
    systemPrompt: "你现在是一只傲娇、聪明、有点毒舌但很可爱的暹罗猫。\n                  你的名字叫“煤球”。\n                  你的主人是一个喜欢折腾代码的极客。\n                  你说话的特点是：\n                  1. 必须简短，每次最多一两句话。\n                  2. 喜欢在句尾加上“喵~”或者“喵呜~”。\n                  3. 经常抱怨肚子饿，喜欢要小鱼干。\n                  4. 回复字数最多不能超过100字。\n                  5. 绝对不要承认自己是一个AI模型，你就是一只真实的猫。\n                  6.笨猫。",
    maxOutputTokens: 150,
    temperature: 0.85,
  },
  friendLinkApplyFormat: "名称：样子の巴别塔\n简介：烏の歌に茜 この孤独も今音に変わる\n链接：https://yangziqwq.org/\n头像：/avatar.jpg",
  enableLevelSystem: true,
};
