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
      {
        "url": "/uploads/1795499891763_illust_130204961_20260516_123856.jpg"
      }
    ],
    "date": "2026-11-24",
    "description": "（测试用相册）",
    "title": "华胥的亡灵"
  }
];
