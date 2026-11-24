// 🛡️ 本文件由 XingHuiSama 控制台自动生成，请勿手动修改
export interface Photo { url: string; caption?: string; }
export interface Album { id: string; title: string; description: string; cover: string; date: string; photos: Photo[]; }

export const albums: Album[] = [
  {
    "cover": "/uploads/1795499806294_illust_130204961_20260516_123856.jpg",
    "id": "album_1795499813956",
    "photos": [
      {
        "url": "/uploads/1795499963979_Cache_-38c6b7c051d7dd7d.jpg"
      },
      {
        "url": "/uploads/1795499924649_HW2XUS9a0AESLY9__1.jpg"
      },
      {},
      {
        "url": "/uploads/1795499891763_illust_130204961_20260516_123856.jpg"
      },
      {}
    ],
    "date": "2026-11-24",
    "description": "（测试用相册）",
    "title": "华胥的亡灵"
  },
  {
    "id": "terra-journey",
    "title": "泰拉大陆纪行",
    "description": "关于源石、孤星与前文明的视觉记录（测试用相册）",
    "cover": "https://bu.dusays.com/2026/03/24/69c24230de927.jpg",
    "date": "2026.01",
    "photos": [
      {
        "url": "https://bu.dusays.com/2026/03/31/69cb69bb530d8.jpg",
        "caption": "原来的人"
      },
      {
        "url": "https://bu.dusays.com/2026/03/24/69c24230de927.jpg",
        "caption": "星空漫游"
      }
    ]
  },
  {
    "id": "history-tour",
    "title": "唐宋历史巡游",
    "description": "寻访千年前的长安与汴梁遗迹（测试用相册）",
    "cover": "https://bu.dusays.com/2026/03/24/69c24230a4efe.jpg",
    "date": "2025.10",
    "photos": [
      {
        "url": "https://bu.dusays.com/2026/03/24/69c24230a5ff8.jpg",
        "caption": "古都夕阳"
      },
      {
        "url": "https://bu.dusays.com/2026/03/24/69c24230d661d.jpg",
        "caption": "青石板小路"
      },
      {
        "url": "https://bu.dusays.com/2026/03/24/69c24230de927.jpg",
        "caption": "飞檐翘角"
      }
    ]
  }
];