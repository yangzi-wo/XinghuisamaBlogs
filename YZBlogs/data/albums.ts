// 🛡️ 本文件由 样子の巴别塔 控制台自动生成，请勿手动修改
export interface Photo { url: string; caption?: string; }
export interface Album { id: string; title: string; description: string; cover: string; date: string; photos: Photo[]; }

export const albums: Album[] = [
  {
    "title": "存活千年",
    "description": "是生者对亡灵的思念",
    "cover": "/uploads/1795618257711_Cache_-2f7b346a0264c680.png",
    "id": "album_1795618260941",
    "photos": [
      {
        "url": "/uploads/1795618389887_20260216_080631.jpg"
      },
      {
        "url": "/uploads/1795618349006_Image_1772549891598_921.jpg"
      },
      {
        "url": "/uploads/1795618321039_C15EBE7BE83FD88F1AC74DF1AB5E01CA.jpg"
      },
      {
        "url": "/uploads/1795618311879_E56565D6C814E91126FE56F8120DE805.png"
      },
      {
        "url": "/uploads/1795618296129_Cache_1a67c7090db7e7a5.jpg"
      }
    ],
    "date": "2026-11-25"
  },
  {
    "cover": "/uploads/1795499806294_illust_130204961_20260516_123856.jpg",
    "id": "album_1795499813956",
    "photos": [
      {
        "url": "/uploads/1795618454626_Image_1765127210789.jpg"
      },
      {
        "url": "/uploads/1795618424931_CHocARAte__________151935104_p0.jpg"
      },
      {
        "url": "/uploads/1795618416040_Image_1765127287003.png"
      },
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
    "description": "死者的故事",
    "title": "华胥的亡灵"
  }
];