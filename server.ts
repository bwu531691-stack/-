import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Lazy helper to get Gemini client, avoiding startup crash if key is missing
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("未偵測到有效的 Gemini API 金鑰。請前往 AI Studio 的 Settings > Secrets 配置您的 GEMINI_API_KEY 環境變數。");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

let mockSpreadsheet: any[] = [];

interface IdeologyDetail {
  desc: string;
  countries: string[];
  figures: string[];
  figureImage?: string;
}

const IDEOLOGY_DATA: Record<string, Record<string, IdeologyDetail>> = {
  "自由主義 (Liberalism)": {
    "古典自由主義": {
      desc: "起源於啟蒙運動，核心在於捍衛個人自由、私有財產權與自由市場。主張政府職能應嚴格限制在保護公民免於暴力、盜竊與欺詐，並維護國家安全。",
      countries: ["英國", "美國", "荷蘭"],
      figures: ["亞當·斯密", "約翰·洛克"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/4/43/Adam_Smith_Portrait.jpg"
    },
    "社會自由主義": {
      desc: "在保障個人自由的基礎上，主張政府應積極介入經濟與社會事務，以消除貧困、疾病與不平等。強調「積極自由」。",
      countries: ["加拿大", "北歐國家"],
      figures: ["約翰·羅爾斯", "凱因斯"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/b/b2/John_Maynard_Keynes.jpg"
    },
    "新自由主義": {
      desc: "主張回歸自由市場機制，推動私有化、去管制化與削減公共開支。",
      countries: ["智利", "英國 (柴契爾時期)"],
      figures: ["海耶克", "米爾頓·傅利曼"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/b/ba/Friedrich_Hayek_portrait.jpg"
    },
    "自由意志主義": {
      desc: "極度強調個人自主權與自我所有權，主張將政府縮減至最低限度。",
      countries: ["美國 (自由黨)"],
      figures: ["羅伯特·諾齊克", "穆瑞·羅斯巴德"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/2/29/Robert_Nozick_1977.jpg"
    },
    "進步主義": {
      desc: "強調解決社會、經濟與政治問題的改革運動，主張利用科學進步與政府介入來提升人類福祉。",
      countries: ["美國 (20世紀初)"],
      figures: ["伍德羅·威爾遜", "富蘭克林·羅斯福"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/4/42/FDR_1944_Color_Portrait.jpg"
    },
    "無政府資本主義": {
      desc: "主張徹底廢除國家及一切政府建制，將所有公共服務（包括治安、法律與防衛）完全交由自由市場中的私人契約與自願性組織運作。",
      countries: ["網路社群", "阿根廷 (米萊時期)"],
      figures: ["穆瑞·羅斯巴德", "哈維爾·米萊"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/e/ec/Javier_Milei_frente_al_Congreso_de_la_Naci%C3%B3n_%28cropped%29.jpg"
    }
  },
  "社會主義 (Socialism)": {
    "馬克思列寧主義": {
      desc: "主張透過職業革命家領導的暴力革命推翻資本主義，建立無產階級專政的一黨制國家。",
      countries: ["蘇聯", "中國", "古巴"],
      figures: ["列寧", "史達林", "馬克思"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/4/4e/Lenin_CL.jpg"
    },
    "社會民主主義": {
      desc: "主張在民主憲政與資本主義框架內，透過和平改革實現社會公正與財富重分配。",
      countries: ["瑞典", "挪威", "丹麥"],
      figures: ["愛德華·伯恩斯坦", "奧洛夫·帕爾梅"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/b/b3/EduardBernstein.jpg"
    },
    "民主社會主義": {
      desc: "認為社會主義必須與民主制度內在地結合，主張經濟民主化與工人自治。",
      countries: ["英國 (工黨歷史派系)"],
      figures: ["喬治·歐威爾", "伯尼·桑德斯"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/7/7e/George_Orwell_press_photo.jpg"
    },
    "毛主義": {
      desc: "強調農民是革命的主力軍，核心概念包括「農村包圍城市」、「群眾路線」。",
      countries: ["中國 (毛澤東時代)"],
      figures: ["毛澤東"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Mao_Zedong_portrait.jpg"
    },
    "托洛茨基主義": {
      desc: "強調「不間斷革命」與國際主義，反對官僚體制與單一國家的社會主義建立。",
      countries: ["墨西哥 (避難)", "第四國際"],
      figures: ["列夫·托洛茨基"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Leon_Trotsky_1921.jpg"
    },
    "工團主義": {
      desc: "主張由勞工組織 or 工會直接控制生產與分配，透過直接行動與大罷工實現變革。",
      countries: ["法國 (20世紀初)"],
      figures: ["喬治·索雷爾"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/0/0c/Georges_Sorel.jpg"
    },
    "空想社會主義": {
      desc: "主張在不訴諸階級鬥爭的情況下，透過宣傳與道德示範，建立合股、和諧與合作的理想合作社群。",
      countries: ["法國 (歷史)", "英國 (歷史)"],
      figures: ["羅伯特·歐文", "聖西門"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/a/af/Robert_Owen_by_William_Henry_Brooke.jpg"
    }
  },
  "保守主義 (Conservatism)": {
    "傳統保守主義": {
      desc: "強調社會秩序的有機性、宗教傳統的權威、自然階級制度及歷史累積的智慧。",
      countries: ["英國", "沙烏地阿拉伯"],
      figures: ["埃德蒙·伯克"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/d/d2/Edmund_Burke_portrait_by_Joshua_Reynolds.jpg"
    },
    "自由保守主義": {
      desc: "結合了保守主義對社會穩定、法律與秩序的重視，以及自由主義對自由市場與個人權利的推崇。",
      countries: ["德國 (CDU)", "澳洲"],
      figures: ["安格拉·梅克爾"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/2/2d/Angela_Merkel_2019_cropped.jpg"
    },
    "新保守主義": {
      desc: "主張強調軍事力量、推廣民主與干預性的外交政策，並結合社會保守價值的意識形態。",
      countries: ["美國 (雷根與小布希時期)"],
      figures: ["倫納德·史特勞斯", "厄文·克里斯托"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/0/02/Irving_Kristol.jpg"
    }
  },
  "無政府主義 (Anarchism)": {
    "無政府共產主義": {
      desc: "主張廢除國家、私有財產與階級制度，建立集體所有與「各盡所能，各取所需」的社會。",
      countries: ["西班牙 (內戰時期)"],
      figures: ["克魯泡特金", "巴枯寧"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/8/87/Peter_Kropotkin_circa_1900.jpg"
    },
    "互助主義": {
      desc: "主張建立基於公平交換與互助信貸的經濟體系。",
      countries: ["法國 (歷史派系)"],
      figures: ["皮耶-約瑟夫·普魯東"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/3/35/Proudhon_1867.jpg"
    },
    "無政府工團主義": {
      desc: "強調透過工會進行階級鬥爭，主張由勞動者控制生產工具。",
      countries: ["西班牙 (CNT)"],
      figures: ["魯道夫·羅克"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/a/af/Rudolf_Rocker_portrait.jpg"
    },
    "個人無政府主義": {
      desc: "將個體的主權置於任何形式的集體權威（如政府或教堂）之上。",
      countries: ["美國", "德國"],
      figures: ["馬克斯·斯特納"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/e/ec/Max_Stirner.jpg"
    }
  },
  "女性主義 (Feminism)": {
    "自由女性主義": {
      desc: "主張透過法律改革與政治手段實現性別平等，強調女性的理性與選擇權。",
      countries: ["全球"],
      figures: ["瑪麗·沃斯通克拉夫特", "貝蒂·傅瑞丹"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Mary_Wollstonecraft_by_John_Opie_%28c._1797%29.jpg"
    },
    "激進女性主義": {
      desc: "主張家長制是社會中最深刻的壓迫根源，致力於推翻整個性別等級體系。",
      countries: ["全球"],
      figures: ["西蒙·波娃", "凱特·米列特"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/0/0c/Simone_de_Beauvoir.jpg"
    },
    "生態女性主義": {
      desc: "將女性受壓迫與大自然受剝削的宿命相連結，主張批判對土地和性別雙重宰制的父權體系。",
      countries: ["全球"],
      figures: ["卡洛琳·麥茜特", "萬達娜·席瓦"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/0/08/Vandana_Shiva_on_15_September_2016.jpg"
    }
  },
  "生態主義 (Environmentalism)": {
    "深層生態學": {
      desc: "主張所有 biological 生物（而不僅是人類）皆有平等的內在價值，強烈反對人類中心主義。",
      countries: ["挪威", "澳洲"],
      figures: ["阿恩·內斯"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Arne_Naess_1998.jpg"
    },
    "生態社會主義": {
      desc: "認為資本主義是環境崩潰的元凶，主張建立一種注重生態平衡、去中心化的集體社會協同體系。",
      countries: ["各國綠黨"],
      figures: ["穆瑞·布克欽"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/b/b3/Murray_Bookchin_1990.jpg"
    }
  },
  "威權與法西斯主義 (Authoritarianism & Fascism)": {
    "義大利法西斯主義": {
      desc: "強調國家至上、極權統治、社團主義經濟及對社會各階層的極致統制與對領袖的絕對服從。",
      countries: ["義大利 (1922-1943)"],
      figures: ["墨索里尼"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/b/be/Benito_Mussolini_portrait.jpg"
    },
    "國家社會主義": {
      desc: "極端的民族主義與種族主義的結合，核心在於雅利安種族優越論及社會達爾文主義的貫徹。",
      countries: ["德國 (1933-1945)"],
      figures: ["希特勒"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/d/d1/Adolf_Hitler_portrait_crop.jpg"
    },
    "佛朗哥主義": {
      desc: "一種結合了天主教權威主義、傳統地主與軍事實力派，政治核心在於強烈愛國與反共的長效威權體制。",
      countries: ["西班牙 (1939-1975)"],
      figures: ["佛朗哥"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/e/ec/Francisco_Franco_portrait.jpg"
    },
    "庇隆主義": {
      desc: "獨創的「正義主義」三原則：社會正義、經濟獨立、政治主權。結合強人氣質、高福利支持與勞資跨階級調和調解。",
      countries: ["阿根廷"],
      figures: ["胡安·庇隆", "伊娃·庇隆"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Juan_Domingo_Per%C3%B3n_circa_1950.png"
    }
  },
  "民粹與大眾思潮 (Populism & Public Currents)": {
    "右翼民粹主義": {
      desc: "訴諸「純潔的人民」對抗「腐敗的建制精英」，主要結合經濟本土主權與限制移民的排外傾向。",
      countries: ["美國 (川普時期)", "匈牙利"],
      figures: ["唐納·川普", "維克多·奧班"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/5/56/Donald_Trump_official_portrait_2017.jpg"
    },
    "左翼民粹主義": {
      desc: "以平民、勞力階級為核心防線，對抗金融资本、寡頭掠奪或跨國帝國主義侵蝕，極力主張底層社會財富再分配。",
      countries: ["希臘 (激進左翼聯盟)", "委內瑞拉"],
      figures: ["烏戈·查維茲", "阿萊克西斯·齊普拉斯"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/5/58/Hugo_Chavez_2010.jpg"
    }
  },
  "民族主義 (Nationalism)": {
    "公民民族主義": {
       desc: "基於共同的政治價值觀、法律權利與公民身份建立民族認同。",
       countries: ["法國", "美國"],
       figures: ["歐內斯特·勒南"],
       figureImage: "https://upload.wikimedia.org/wikipedia/commons/d/da/Ernest_Renan_par_L_Bonnat_copie.jpg"
    },
    "族群民族主義": {
      desc: "強調共同的語言、宗教、血緣或種族特徵作為民族認同的基礎。",
      countries: ["匈牙利", "塞爾維亞"],
      figures: ["約翰·戈特利布·費希特"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Johann_Gottlieb_Fichte.JPG"
    }
  },
  "地緣政治主義 (Geopolitical Ideologies)": {
    "泛亞主義": {
      desc: "主張亞洲國家應聯合起來反對西方帝國主義，實現文化與政治的統一。",
      countries: ["日本 (歷史)", "中國 (歷史)"],
      figures: ["孫中山", "福澤諭吉"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/3/3d/Fukuzawa_Yukichi1.jpg"
    },
    "泛斯拉夫主義": {
      desc: "主張所有斯拉夫民族應加強文化聯繫，甚至建立一個統一的政治體系。",
      countries: ["俄羅斯 (歷史)", "波蘭"],
      figures: ["尼古拉·丹尼列夫斯基"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Danilewski_Nikolai.jpg"
    }
  },
  "宗教意識形態 (Religious Ideologies)": {
    "伊斯蘭主義": {
      desc: "主張將伊斯蘭教法作為國家法律、政治體制與社會生活的唯一準則。",
      countries: ["伊朗", "阿富汗"],
      figures: ["霍梅尼"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Rouhollah_Khomeini_2.png"
    },
    "基督民主主義": {
      desc: "在民主框架下運用基督教核心價值，強調社會正義、互補性與團結。",
      countries: ["德國", "義大利", "智利"],
      figures: ["孔拉德·阿登納"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/6/62/Konrad_Adenauer_H_1952.jpg"
    }
  },
  "極端與邊緣意識形態 (Fringe & Extremism)": {
    "加速主義": {
      desc: "主張透過加速資本主義的運作或技術發展，來促成現有體系的崩潰與變型。",
      countries: ["網路社群"],
      figures: ["尼克·蘭德"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/7/75/Nick_Land_at_Goldsmiths.jpg"
    },
    "納粹神祕學": {
      desc: "將雅利安優越論與各種神祕學傳統相結合。",
      countries: ["納粹德國 (歷史)"],
      figures: ["海恩里希·希姆萊"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/4/49/Heinrich_Himmler_1942.jpg"
    }
  },
  "未來與後工業意識形態 (Future & Post-Industrial)": {
    "超人類主義": {
      desc: "主張利用科技手段增強人類生理與認知能力，最終超越人類現有的生物限制。",
      countries: ["矽谷", "全球"],
      figures: ["馬克斯·莫爾", "雷·庫茲維爾"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Ray_Kurzweil_at_the_2010_Inc._500_Conference.jpg"
    },
    "技術官僚主義": {
      desc: "主張決策應基於科學證據與技術知識，而非政治角力或大眾情感。",
      countries: ["美國 (歷史)", "數位治理倡議"],
      figures: ["霍華德·斯科特"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Howard_Scott_1933.jpg"
    },
    "分配主義": {
      desc: "主張生產工具（財產）應廣泛分配，反對財富過度集中於國家或少數企業手中。",
      countries: ["歐洲派系"],
      figures: ["G·K·切斯特頓", "希萊爾·貝洛克"],
      figureImage: "https://upload.wikimedia.org/wikipedia/commons/8/86/G._K._Chesterton_1920.jpg"
    }
  }
};

const IDEOLOGY_METRICS: Record<string, { liberty: number; market: number; progress: number; globalize: number }> = {
  "古典自由主義": { liberty: 90, market: 95, progress: 60, globalize: 70 },
  "社會自由主義": { liberty: 75, market: 55, progress: 85, globalize: 80 },
  "新自由主義": { liberty: 70, market: 90, progress: 50, globalize: 85 },
  "自由意志主義": { liberty: 98, market: 98, progress: 55, globalize: 60 },
  "進步主義": { liberty: 70, market: 40, progress: 95, globalize: 75 },
  "馬克思列寧主義": { liberty: 15, market: 5, progress: 85, globalize: 90 },
  "社會民主主義": { liberty: 80, market: 45, progress: 85, globalize: 85 },
  "民主社會主義": { liberty: 75, market: 25, progress: 90, globalize: 80 },
  "毛主義": { liberty: 10, market: 5, progress: 80, globalize: 75 },
  "托洛茨基主義": { liberty: 25, market: 5, progress: 90, globalize: 98 },
  "工團主義": { liberty: 60, market: 10, progress: 85, globalize: 80 },
  "傳統保守主義": { liberty: 40, market: 65, progress: 15, globalize: 25 },
  "自由保守主義": { liberty: 60, market: 80, progress: 35, globalize: 50 },
  "新保守主義": { liberty: 50, market: 75, progress: 30, globalize: 65 },
  "無政府共產主義": { liberty: 95, market: 5, progress: 95, globalize: 95 },
  "互助主義": { liberty: 90, market: 35, progress: 85, globalize: 80 },
  "無政府工團主義": { liberty: 92, market: 10, progress: 90, globalize: 90 },
  "個人無政府主義": { liberty: 99, market: 50, progress: 80, globalize: 70 },
  "自由女性主義": { liberty: 85, market: 60, progress: 90, globalize: 85 },
  "激進女性主義": { liberty: 75, market: 30, progress: 98, globalize: 80 },
  "深層生態學": { liberty: 60, market: 20, progress: 90, globalize: 90 },
  "生態社會主義": { liberty: 65, market: 15, progress: 95, globalize: 90 },
  "義大利法西斯主義": { liberty: 5, market: 30, progress: 10, globalize: 10 },
  "國家社會主義": { liberty: 1, market: 20, progress: 5, globalize: 5 },
  "公民民族主義": { liberty: 75, market: 70, progress: 70, globalize: 40 },
  "族群民族主義": { liberty: 30, market: 45, progress: 20, globalize: 10 },
  "泛亞主義": { liberty: 45, market: 50, progress: 50, globalize: 30 },
  "泛斯拉夫主義": { liberty: 35, market: 40, progress: 30, globalize: 20 },
  "伊斯蘭主義": { liberty: 20, market: 40, progress: 10, globalize: 15 },
  "基督民主主義": { liberty: 60, market: 55, progress: 50, globalize: 65 },
  "加速主義": { liberty: 50, market: 85, progress: 85, globalize: 85 },
  "納粹神祕學": { liberty: 5, market: 25, progress: 5, globalize: 5 },
  "超人類主義": { liberty: 85, market: 75, progress: 98, globalize: 95 },
  "技術官僚主義": { liberty: 40, market: 30, progress: 80, globalize: 80 },
  "分配主義": { liberty: 75, market: 20, progress: 50, globalize: 30 },
  "無政府資本主義": { liberty: 95, market: 99, progress: 65, globalize: 40 },
  "空想社會主義": { liberty: 80, market: 5, progress: 85, globalize: 60 },
  "生態女性主義": { liberty: 85, market: 20, progress: 95, globalize: 80 },
  "佛朗哥主義": { liberty: 10, market: 55, progress: 10, globalize: 15 },
  "庇隆主義": { liberty: 30, market: 35, progress: 50, globalize: 30 },
  "右翼民粹主義": { liberty: 35, market: 60, progress: 20, globalize: 15 },
  "左翼民粹主義": { liberty: 40, market: 20, progress: 80, globalize: 50 }
};

const CATEGORY_THEMES: Record<string, { hex: string; text: string; bg: string; border: string; glow: string; name: string }> = {
  "自由主義": { name: "amber", hex: "#eab308", text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", glow: "shadow-amber-500/20" },
  "社會主義": { name: "red", hex: "#ef4444", text: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", glow: "shadow-red-500/20" },
  "保守主義": { name: "blue", hex: "#3b82f6", text: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30", glow: "shadow-blue-500/20" },
  "無政府主義": { name: "zinc", hex: "#9ca3af", text: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/30", glow: "shadow-zinc-500/20" },
  "女性主義": { name: "fuchsia", hex: "#d946ef", text: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", glow: "shadow-fuchsia-500/20" },
  "生態主義": { name: "emerald", hex: "#10b981", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", glow: "shadow-emerald-500/20" },
  "威權": { name: "rose", hex: "#f43f5e", text: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/30", glow: "shadow-rose-500/20" },
  "民粹": { name: "orange", hex: "#f97316", text: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30", glow: "shadow-orange-500/20" },
  "民族": { name: "violet", hex: "#8b5cf6", text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/30", glow: "shadow-violet-500/20" },
  "地緣": { name: "teal", hex: "#0d9488", text: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/30", glow: "shadow-teal-500/20" },
  "宗教": { name: "yellow", hex: "#eab308", text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", glow: "shadow-yellow-500/20" },
  "極端": { name: "red-dark", hex: "#991b1b", text: "text-red-700", bg: "bg-red-950/25", border: "border-red-900/40", glow: "shadow-red-950/20" },
  "未來": { name: "cyan", hex: "#06b6d4", text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", glow: "shadow-cyan-500/20" }
};

app.post("/api/action/:functionName", async (req, res) => {
  const { functionName } = req.params;
  const args = req.body.args || [];
  if (functionName === "getIdeologyData") {
    const mergedData = JSON.parse(JSON.stringify(IDEOLOGY_DATA));
    for (const mainCategory in mergedData) {
      let categoryTheme = { name: "cyan", hex: "#06b6d4", text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", glow: "shadow-cyan-500/20" };
      for (const key in CATEGORY_THEMES) {
        if (mainCategory.includes(key)) {
          categoryTheme = CATEGORY_THEMES[key];
          break;
        }
      }
      for (const subCategory in mergedData[mainCategory]) {
        mergedData[mainCategory][subCategory].theme = categoryTheme;
        if (IDEOLOGY_METRICS[subCategory]) {
          mergedData[mainCategory][subCategory].metrics = IDEOLOGY_METRICS[subCategory];
        } else {
          mergedData[mainCategory][subCategory].metrics = { liberty: 50, market: 50, progress: 50, globalize: 50 };
        }
      }
    }
    res.json({ status: "success", data: mergedData });
  } else if (functionName === "analyzeIdeology") {
    const [name, desc] = args;
    try {
      const response = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `你是一個硬核政治學與歷史學分析專家。
請針對以下意識形態進行深度解析：
名稱：${name}
基本描述：${desc}

請回傳精簡但深入的分析，包含以下三個部分：
1. [核心矛盾] (Core Contradictions): 該思想內部最深刻的邏輯矛盾或實踐困境。
2. [權力結構] (Power Dynamics): 這種思想如何重新分配或重構權力關係。
3. [現代變體] (Modern Evolution): 在當前數位時代或 21 世紀的變體或其影響。

請使用專業、中性但具有批判性的硬核工業風格語氣，並以 Markdown 格式回覆。`,
      });
      res.json({ status: "success", data: response.text });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message || String(error) });
    }
  } else if (functionName === "compareIdeologies") {
    const [nameA, descA, nameB, descB] = args;
    try {
      const response = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `你是一個硬核政治學與歷史學分析專家。
請針對以下兩個意識形態進行「對比與共振檢索分析」：
意識形態 A：${nameA} (描述: ${descA})
意識形態 B：${nameB} (描述: ${descB})

請回傳精簡但深入的雙向對比報告，包含以下三個部分：
1. [交集與哲學共鳴] (Philosophical Convergence): 兩者在最根本、最隱蔽層面上的共同點或共同痛點。
2. [分歧與實踐對立] (Divergence & Conflict): 兩者在權力構築與實施路徑上最核心的分歧。
3. [共振綜合體/跨界變體] (Synthesis Paradigm): 如果將這兩種元素熔煉，在現代或未來社會政策中會形成什麼樣的複合體或趨勢？

請使用專業、中性但具有批判性的硬核工業風格語氣，並以 Markdown 格式回覆。`,
      });
      res.json({ status: "success", data: response.text });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message || String(error) });
    }
  } else if (functionName === "saveIdeology") {
    const entry = { timestamp: new Date().toISOString(), ...args[0] };
    mockSpreadsheet.push(entry);
    res.json({ status: "success", message: "資料已成功寫入試算表 (模擬)" });
  } else if (functionName === "getSavedEntries") {
    res.json({ status: "success", data: mockSpreadsheet });
  } else {
    res.status(404).json({ status: "error", message: "Function not found" });
  }
});

// Integrate Vite middleware
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
