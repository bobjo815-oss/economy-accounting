import type { Locale } from "@/lib/i18n/messages";
import type { CashDirection } from "./records";

const starterLabels: { direction: CashDirection; group: readonly [string, string]; name: readonly [string, string] }[] = [
  { direction: "inflow", group: ["수입", "Income"], name: ["급여", "Pay"] },
  { direction: "inflow", group: ["수입", "Income"], name: ["장학금", "Scholarship"] },
  { direction: "inflow", group: ["수입", "Income"], name: ["가족 지원", "Family support"] },
  { direction: "inflow", group: ["수입", "Income"], name: ["환급", "Refund"] },
  { direction: "inflow", group: ["수입", "Income"], name: ["기타 수입", "Other income"] },
  { direction: "outflow", group: ["주거·공과금", "Housing & bills"], name: ["월세", "Rent"] },
  { direction: "outflow", group: ["주거·공과금", "Housing & bills"], name: ["공과금", "Utilities"] },
  { direction: "outflow", group: ["식비", "Food"], name: ["식료품", "Groceries"] },
  { direction: "outflow", group: ["식비", "Food"], name: ["외식", "Dining"] },
  { direction: "outflow", group: ["교통·여행", "Transport & travel"], name: ["대중교통", "Public transport"] },
  { direction: "outflow", group: ["교통·여행", "Transport & travel"], name: ["여행", "Travel"] },
  { direction: "outflow", group: ["학업", "Study"], name: ["등록금·수업료", "Tuition & fees"] },
  { direction: "outflow", group: ["학업", "Study"], name: ["책·학용품", "Books & supplies"] },
  { direction: "outflow", group: ["생활", "Personal"], name: ["통신비", "Phone & internet"] },
  { direction: "outflow", group: ["생활", "Personal"], name: ["의료·건강", "Health"] },
  { direction: "outflow", group: ["생활", "Personal"], name: ["쇼핑", "Shopping"] },
  { direction: "outflow", group: ["생활", "Personal"], name: ["여가·오락", "Leisure"] },
  { direction: "outflow", group: ["생활", "Personal"], name: ["기타 지출", "Other expense"] },
];

export function starterCategories(userId: string, locale: Locale) {
  return starterLabels.map((item, index) => ({
    user_id: userId,
    major_name: item.group[locale === "ko" ? 0 : 1],
    name: item.name[locale === "ko" ? 0 : 1],
    normal_direction: item.direction,
    sort_order: index,
  }));
}
