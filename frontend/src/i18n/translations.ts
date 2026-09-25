export type Language = "en" | "th";
export type Theme = "day" | "night";

export const translations = {
  en: {
    header: {
      subtitle:
        "Illuminance & Temperature Monitoring",

      guest: "Guest",
      admin: "Admin",

      languageLabel: "Language",

      switchToDay:
        "Switch to day mode",

      switchToNight:
        "Switch to night mode",
    },

    room: {
      title: "CPE Co-Working Space",

      subtitle:
        "Simplified room view based on the as-built plan",

      pending:
        "Sensor markers will appear after installation positions are finalized.",

      note:
        "The room drawing is simplified for dashboard use. Sensor positions are not shown yet.",

      scale: "Scale",
    },

    health: {
      title: "System Status",

      subtitle:
        "Backend development diagnostics",

      refresh: "Refresh",
      checking: "Checking...",

      backend: "Backend API",
      database: "PostgreSQL",

      connected: "Connected",
      unavailable: "Unavailable",

      uptime: "Uptime",
      timestamp: "Server time",

      backendUnavailable:
        "Unable to connect to the backend.",
    },
  },

  th: {
    header: {
      subtitle:
        "ติดตามค่าความส่องสว่างและอุณหภูมิ",

      guest: "ผู้เยี่ยมชม",
      admin: "ผู้ดูแลระบบ",

      languageLabel: "ภาษา",

      switchToDay:
        "เปลี่ยนเป็นโหมดกลางวัน",

      switchToNight:
        "เปลี่ยนเป็นโหมดกลางคืน",
    },

    room: {
      title: "CPE Co-Working Space",

      subtitle:
        "ภาพห้องแบบย่อจากแปลน As-built",

      pending:
        "ตำแหน่งเซนเซอร์จะแสดงหลังจากกำหนดจุดติดตั้งแล้ว",

      note:
        "แปลนห้องถูกลดรายละเอียดเพื่อให้เหมาะกับหน้า Dashboard และยังไม่แสดงตำแหน่งเซนเซอร์",

      scale: "สเกล",
    },

    health: {
      title: "สถานะระบบ",

      subtitle:
        "ข้อมูลสำหรับตรวจสอบระบบระหว่างการพัฒนา",

      refresh: "รีเฟรช",
      checking: "กำลังตรวจสอบ...",

      backend: "Backend API",
      database: "PostgreSQL",

      connected: "เชื่อมต่อแล้ว",
      unavailable: "ไม่สามารถเชื่อมต่อ",

      uptime: "ระยะเวลาทำงาน",
      timestamp: "เวลาของเซิร์ฟเวอร์",

      backendUnavailable:
        "ไม่สามารถเชื่อมต่อ Backend ได้",
    },
  },
} as const;