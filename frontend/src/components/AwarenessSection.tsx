import type { Language } from "../i18n/translations";
import { DEFAULT_MIN_LUX } from "../lib/luxMeter";

const GREEN_OFFICE_URL = "https://www.dcce.go.th/1687/";

const TIEA_GUIDE_URL =
  "https://www.tieathai.org/_files/ugd/470409_1c1dd80275e0445d91af87dccd0bd253.pdf";

const COPY = {
  en: {
    title: "Why these lighting values?",
    newTab: "opens in a new tab",
    lux: {
      title: `Why ${DEFAULT_MIN_LUX} lux?`,
      body: "Lux measures how much light falls on a surface. 500 lux is the recommended average on the desk for office writing, typing, reading and data processing. We treat this co-working space as an office.",
      points: [
        "500 lux is the starting value. An administrator can change it for a zone, and each zone card shows the value in use.",
        "Sensors measure where they are mounted, so the light on your desk may differ.",
        "Brighter is not always better: bright lamps can reflect in your screen. Section 3.7 of the same guide limits this glare in cd/m², separate from the 500 lux level. This dashboard does not measure it.",
        "Light you do not need also uses electricity.",
      ],
      source:
        "Source: TIEA, Guidelines for Indoor Lighting Design (2018), chapter 4, group 22 (offices), and section 3.7.",
      link: "Lighting guide (PDF, in Thai)",
    },
    green: {
      title: "Green Office",
      body: "A programme of the Department of Climate Change and Environment that encourages offices to save energy and keep a suitable, safe working environment. Chiang Mai University has a policy to follow it. This project relates to:",
      points: [
        "Category 2: Communication and awareness",
        "Category 3: Use of resources and energy",
        "Category 5: Environment and safety",
      ],
      source: "",
      link: "Green Office criteria at DCCE",
    },
  },
  th: {
    title: "ทำไมต้องกำหนดค่าความสว่างเท่านี้",
    newTab: "เปิดในแท็บใหม่",
    lux: {
      title: `ทำไมต้อง ${DEFAULT_MIN_LUX} ลักซ์`,
      body: "ลักซ์ (Lux) คือปริมาณแสงที่ตกกระทบบนพื้นผิว ค่า 500 ลักซ์เป็นความส่องสว่างเฉลี่ยบนโต๊ะที่แนะนำสำหรับงานสำนักงาน ได้แก่ เขียน พิมพ์ อ่าน และจัดการข้อมูล โครงงานนี้กำหนดให้ห้อง Co-working Space เป็นสำนักงาน",
      points: [
        "500 ลักซ์เป็นค่าเริ่มต้น ผู้ดูแลระบบปรับค่าของแต่ละโซนได้ และการ์ดของโซนจะแสดงค่าที่ใช้อยู่",
        "เซนเซอร์วัดแสง ณ จุดที่ติดตั้ง ค่าจึงอาจต่างจากแสงบนโต๊ะของคุณ",
        "สว่างกว่าไม่ได้ดีกว่าเสมอ โคมไฟที่สว่างจ้าอาจสะท้อนบนหน้าจอ คู่มือเล่มเดียวกันข้อ 3.7 จึงจำกัดแสงสะท้อนนี้ในหน่วย cd/m² ซึ่งเป็นคนละเกณฑ์กับ 500 ลักซ์ และแดชบอร์ดนี้ไม่ได้วัด",
        "แสงที่เกินความจำเป็นยังสิ้นเปลืองไฟฟ้า",
      ],
      source:
        "ที่มา: สมาคมไฟฟ้าแสงสว่างแห่งประเทศไทย คู่มือแนวทางการออกแบบการส่องสว่างภายในอาคาร (พ.ศ. 2561) บทที่ 4 กลุ่มที่ 22 สำนักงาน และข้อ 3.7",
      link: "คู่มือการส่องสว่าง (PDF)",
    },
    green: {
      title: "สำนักงานสีเขียว (Green Office)",
      body: "โครงการของกรมการเปลี่ยนแปลงสภาพภูมิอากาศและสิ่งแวดล้อม ส่งเสริมให้สำนักงานลดการใช้พลังงานและมีสภาพแวดล้อมการทำงานที่เหมาะสมและปลอดภัย มหาวิทยาลัยเชียงใหม่มีนโยบายดำเนินการตามโครงการนี้ โครงงานนี้เกี่ยวข้องกับ",
      points: [
        "หมวดที่ 2 การสื่อสารและสร้างจิตสำนึก",
        "หมวดที่ 3 การใช้ทรัพยากรและพลังงาน",
        "หมวดที่ 5 สภาพแวดล้อมและความปลอดภัย",
      ],
      source: "",
      link: "ดูเกณฑ์สำนักงานสีเขียวที่เว็บไซต์กรมฯ",
    },
  },
} as const;

export function AwarenessSection({ language }: { language: Language }) {
  const copy = COPY[language];

  const cards = [
    { ...copy.lux, href: TIEA_GUIDE_URL },
    { ...copy.green, href: GREEN_OFFICE_URL },
  ];

  return (
    // The section is named for screen readers only; each box has its own heading.
    <section id="awareness" className="awareness" aria-label={copy.title}>
      <div className="awareness-grid">
        {cards.map((card) => (
          <article className="awareness-card" key={card.href}>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
            <ul>
              {card.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {card.source && <p className="awareness-note">{card.source}</p>}
            <a
              className="awareness-link"
              href={card.href}
              target="_blank"
              rel="noreferrer"
              title={copy.newTab}
            >
              {card.link} ↗
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
