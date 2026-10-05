import type { JapaneseWord, WordRepresentation } from './learning-content';

function jw(
  id: string, hiragana: string, es: string[], emoji: string,
  category: string, difficulty: number, kanji?: string
): JapaneseWord {
  const representations: WordRepresentation[] = [
    { type: 'image', value: emoji, availableForAges: [4, 6] },
    { type: 'hiragana', value: hiragana, availableForAges: [6] },
    { type: 'audio', value: id, availableForAges: [4, 6] },
  ];
  if (kanji) {
    representations.splice(2, 0, { type: 'kanji', value: kanji, availableForAges: [6] });
  }
  return {
    id, hiragana, kanji, meanings: es, category,
    image: `images/japanese/${id}.webp`,
    audio: `audio/japanese/${category}/${id}.wav`,
    recommendedAgeMin: 4,
    difficulty,
    skills: ['japanese.listening', 'japanese.vocabulary'],
    representations,
  };
}

const JAPANESE_ANIMALS: JapaneseWord[] = [
  jw('uma', 'うま', ['caballo'], '🐴', 'animals', 2, '馬'),
  jw('ushi', 'うし', ['vaca'], '🐮', 'animals', 2, '牛'),
  jw('buta', 'ぶた', ['cerdo'], '🐷', 'animals', 2, '豚'),
  jw('saru', 'さる', ['mono'], '🐵', 'animals', 2, '猿'),
  jw('zou', 'ぞう', ['elefante'], '🐘', 'animals', 2, '象'),
  jw('hitsuji', 'ひつじ', ['oveja'], '🐑', 'animals', 2, '羊'),
  jw('niwatori', 'にわとり', ['gallina'], '🐔', 'animals', 2, '鶏'),
  jw('kame', 'かめ', ['tortuga'], '🐢', 'animals', 2, '亀'),
  jw('kaeru', 'かえる', ['rana'], '🐸', 'animals', 2, '蛙'),
  jw('kuma', 'くま', ['oso'], '🐻', 'animals', 2, '熊'),
  jw('raion', 'ライオン', ['león'], '🦁', 'animals', 2),
  jw('panda', 'パンダ', ['panda'], '🐼', 'animals', 2),
  jw('pengin', 'ペンギン', ['pingüino'], '🐧', 'animals', 2),
  jw('kujira', 'くじら', ['ballena'], '🐳', 'animals', 2, '鯨'),
  jw('chouchou', 'ちょうちょう', ['mariposa'], '🦋', 'animals', 2),
  jw('nezumi', 'ねずみ', ['ratón'], '🐭', 'animals', 2, '鼠'),
  jw('hiyoko', 'ひよこ', ['pollito'], '🐥', 'animals', 2),
  jw('ari', 'あり', ['hormiga'], '🐜', 'animals', 2, '蟻'),
  jw('neko', 'ねこ', ['gato'], '🐱', 'animals', 2, '猫'),
  jw('inu', 'いぬ', ['perro'], '🐶', 'animals', 2, '犬'),
  jw('sakana', 'さかな', ['pez'], '🐟', 'animals', 2, '魚'),
  jw('usagi', 'うさぎ', ['conejo'], '🐰', 'animals', 2),
];

const JAPANESE_FOOD: JapaneseWord[] = [
  jw('mikan', 'みかん', ['mandarina'], '🍊', 'food', 3),
  jw('budou', 'ぶどう', ['uva'], '🍇', 'food', 3),
  jw('ichigo', 'いちご', ['fresa'], '🍓', 'food', 3),
  jw('suika', 'すいか', ['sandía'], '🍉', 'food', 3),
  jw('momo', 'もも', ['durazno'], '🍑', 'food', 3),
  jw('remon', 'レモン', ['limón'], '🍋', 'food', 3),
  jw('ninjin', 'にんじん', ['zanahoria'], '🥕', 'food', 3),
  jw('tomato', 'トマト', ['tomate'], '🍅', 'food', 3),
  jw('tamago', 'たまご', ['huevo'], '🥚', 'food', 3),
  jw('pan', 'パン', ['pan'], '🍞', 'food', 3),
  jw('gohan', 'ごはん', ['arroz', 'comida'], '🍚', 'food', 3),
  jw('onigiri', 'おにぎり', ['bola de arroz'], '🍙', 'food', 3),
  jw('gyuunyuu', 'ぎゅうにゅう', ['leche'], '🥛', 'food', 3, '牛乳'),
  jw('chiizu', 'チーズ', ['queso'], '🧀', 'food', 3),
  jw('aisu', 'アイスクリーム', ['helado'], '🍦', 'food', 3),
  jw('keeki', 'ケーキ', ['pastel'], '🎂', 'food', 3),
  jw('banana', 'バナナ', ['plátano'], '🍌', 'food', 3)
];

const JAPANESE_BODY: JapaneseWord[] = [
  // Cabeza y Cara
  jw('me', 'め', ['ojo'], '👁️', 'body', 4, '目'),
  jw('mimi', 'みみ', ['oreja'], '👂', 'body', 4, '耳'),
  jw('hana', 'はな', ['nariz'], '👃', 'body', 4, '鼻'),
  jw('kuchi', 'くち', ['boca'], '👄', 'body', 4, '口'),
  jw('kao', 'かお', ['cara'], '😀', 'body', 4, '顔'),
  jw('ha', 'は', ['diente'], '🦷', 'body', 4, '歯'),
  jw('shita', 'した', ['lengua'], '👅', 'body', 4, '舌'),
  jw('atama', 'あたま', ['cabeza'], '🗣️', 'body', 4, '頭'),
  jw('kami', 'かみ', ['pelo', 'cabello'], '💇‍♀️', 'body', 4, '髪'),
  // Extremidades y Articulaciones
  jw('te', 'て', ['mano'], '✋', 'body', 4, '手'),
  jw('ashi', 'あし', ['pie', 'pierna'], '🦶', 'body', 4, '足'),
  jw('kata', 'かた', ['hombro'], '🤷', 'body', 4, '肩'),
  jw('hiza', 'ひざ', ['rodilla'], '🦵', 'body', 4, '膝'),
  jw('yubi', 'ゆび', ['dedo'], '👆', 'body', 4, '指'),
  jw('tsume', 'つめ', ['uña'], '💅', 'body', 4, '爪'),
  jw('onaka', 'おなか', ['barriga', 'panza'], '🤰', 'body', 4),
  jw('heso', 'へそ', ['ombligo'], '🌀', 'body', 4),
  // Anatomía interna / Ciencia (Perfecto para su nivel)
  jw('shinzou', 'しんぞう', ['corazón'], '🫀', 'body', 4, '心臓'),
  jw('nou', 'のう', ['cerebro'], '🧠', 'body', 4, '脳'),
  jw('hai', 'はい', ['pulmón', 'pulmones'], '🫁', 'body', 4, '肺'),
  jw('bone', 'ほね', ['hueso'], '🦴', 'body', 4, '骨'),
];

const JAPANESE_TRANSPORT: JapaneseWord[] = [
  jw('densha', 'でんしゃ', ['tren'], '🚆', 'transport', 4, '電車'),
  jw('basu', 'バス', ['autobús'], '🚌', 'transport', 4),
  jw('hikouki', 'ひこうき', ['avión'], '✈️', 'transport', 4, '飛行機'),
  jw('fune', 'ふね', ['barco'], '🚢', 'transport', 4, '船'),
  jw('jitensha', 'じてんしゃ', ['bicicleta'], '🚲', 'transport', 4, '自転車'),
  jw('roketto', 'ロケット', ['cohete'], '🚀', 'transport', 4),
  jw('patokaa', 'パトカー', ['patrulla'], '🚓', 'transport', 4),
  jw('kyuukyuusha', 'きゅうきゅうしゃ', ['ambulancia'], '🚑', 'transport', 4, '救急車'),
  jw('kuruma', 'くるま', ['auto'], '🚲', 'transport', 4, '車'),
];

const JAPANESE_COLORS: JapaneseWord[] = [
  jw('aka', 'あか', ['rojo'], '🔴', 'colors', 5, '赤'),
  jw('ao', 'あお', ['azul'], '🔵', 'colors', 5, '青'),
  jw('kiiro', 'きいろ', ['amarillo'], '🟡', 'colors', 5, '黄色'),
  jw('midori', 'みどり', ['verde'], '🟢', 'colors', 5, '緑'),
  jw('shiro', 'しろ', ['blanco'], '⚪', 'colors', 5, '白'),
  jw('kuro', 'くろ', ['negro'], '⚫', 'colors', 5, '黒'),
  jw('murasaki', 'むらさき', ['morado'], '🟣', 'colors', 5, '紫'),
  jw('orenji', 'オレンジ', ['naranja'], '🟠', 'colors', 5),
  jw('chairo', 'ちゃいろ', ['café', 'marrón'], '🟤', 'colors', 5, '茶色'),
];

const JAPANESE_DAILY: JapaneseWord[] = [
  jw('isu', 'いす', ['silla'], '🪑', 'daily', 6, '椅子'),
  jw('beddo', 'ベッド', ['cama'], '🛏️', 'daily', 6),
  jw('denwa', 'でんわ', ['teléfono'], '📞', 'daily', 6, '電話'),
  jw('tokei', 'とけい', ['reloj'], '⏰', 'daily', 6, '時計'),
  jw('kasa', 'かさ', ['paraguas'], '☂️', 'daily', 6, '傘'),
  jw('kutsu', 'くつ', ['zapato'], '👟', 'daily', 6, '靴'),
  jw('boushi', 'ぼうし', ['gorra'], '🧢', 'daily', 6, '帽子'),
  jw('kaban', 'かばん', ['mochila', 'bolso'], '🎒', 'daily', 6, '鞄'),
  jw('enpitsu', 'えんぴつ', ['lápiz'], '✏️', 'daily', 6, '鉛筆'),
  jw('hasami', 'はさみ', ['tijeras'], '✂️', 'daily', 6),
  jw('megane', 'めがね', ['lentes'], '👓', 'daily', 6, '眼鏡'),
  jw('booru', 'ボール', ['pelota'], '⚽', 'daily', 6),
];

const JAPANESE_FAMILY: JapaneseWord[] = [
  jw('okaasan', 'おかあさん', ['mamá'], '👩', 'family', 7),
  jw('otousan', 'おとうさん', ['papá'], '👨', 'family', 7),
  jw('obaachan', 'おばあちゃん', ['abuela'], '👵', 'family', 7),
  jw('ojiichan', 'おじいちゃん', ['abuelo'], '👴', 'family', 7),
  jw('akachan', 'あかちゃん', ['bebé'], '👶', 'family', 7),
  jw('imouto', 'いもうと', ['hermana menor'], '👧', 'family', 7, '妹'),
  jw('oneesan', 'おねえさん', ['hermana mayor'], '👧', 'family', 7, 'お姉さん'),
];

const JAPANESE_NATURE: JapaneseWord[] = [
  jw('hoshi', 'ほし', ['estrella'], '⭐', 'nature', 7, '星'),
  jw('niji', 'にじ', ['arcoíris'], '🌈', 'nature', 7, '虹'),
  jw('taiyou', 'たいよう', ['sol'], '☀️', 'nature', 7, '太陽'),
];

export const EXTRA_JAPANESE_WORDS: JapaneseWord[] = [
  ...JAPANESE_ANIMALS,
  ...JAPANESE_FOOD,
  ...JAPANESE_BODY,
  ...JAPANESE_TRANSPORT,
  // ...JAPANESE_FAMILY,
  // ...JAPANESE_NATURE,
  // ...JAPANESE_COLORS,
  // ...JAPANESE_DAILY
];
