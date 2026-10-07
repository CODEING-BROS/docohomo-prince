import "dotenv/config";
import { prisma } from "../lib/prisma";

// A small starting set of test questions for the consulting streams that have none yet:
//   npm run db:starter-questions
// These are basic, textbook-level questions so that every stream has a working test from day one.
// They are meant to be reviewed and replaced by the doctors' panel in Admin → Consulting streams.
// A stream that already has questions is left alone.

type Starter = [question: string, options: string[], correctIndex: number];

const STARTERS: Record<string, Starter[]> = {
  Ayurveda: [
    ["Which are the three doshas described in Ayurveda?", ["Sattva, Rajas, Tamas", "Vata, Pitta, Kapha", "Rasa, Rakta, Mamsa", "Agni, Ama, Ojas"], 1],
    ["The Charaka Samhita deals mainly with which branch?", ["Surgery (Shalya)", "Internal medicine (Kayachikitsa)", "Toxicology (Agada)", "Paediatrics (Kaumarabhritya)"], 1],
    ["Which of these is one of the five Panchakarma procedures?", ["Vamana", "Abhyanga", "Shirodhara", "Lepa"], 0],
    ["How many dhatus (body tissues) does Ayurveda describe?", ["Three", "Five", "Seven", "Nine"], 2],
    ["Triphala is a combination of which three fruits?", ["Amalaki, Bibhitaki, Haritaki", "Pippali, Maricha, Shunthi", "Guduchi, Neem, Tulsi", "Ashwagandha, Shatavari, Bala"], 0],
  ],
  Allopathy: [
    ["What is the normal resting heart rate of a healthy adult?", ["40 to 60 beats a minute", "60 to 100 beats a minute", "100 to 120 beats a minute", "120 to 140 beats a minute"], 1],
    ["What is the first-line drug in anaphylaxis?", ["Intravenous hydrocortisone", "Oral antihistamine", "Intramuscular adrenaline", "Nebulised salbutamol"], 2],
    ["Insulin is produced by which cells?", ["Alpha cells of the pancreas", "Beta cells of the pancreas", "Hepatocytes", "Chief cells of the stomach"], 1],
    ["Deficiency of which vitamin causes scurvy?", ["Vitamin A", "Vitamin B12", "Vitamin C", "Vitamin D"], 2],
    ["A fasting plasma glucose at or above which value is diagnostic of diabetes?", ["100 mg/dL", "110 mg/dL", "126 mg/dL", "140 mg/dL"], 2],
  ],
  Unani: [
    ["Which are the four humours (akhlat) of Unani medicine?", ["Dam, Balgham, Safra, Sauda", "Vata, Pitta, Kapha, Rakta", "Hawa, Aab, Aatish, Khak", "Ruh, Nafs, Qalb, Aql"], 0],
    ["Who is regarded as the father of Unani medicine?", ["Galen", "Hippocrates", "Ibn Sina", "Razi"], 1],
    ["Who wrote Al-Qanun fi'l-Tibb (The Canon of Medicine)?", ["Al-Razi", "Ibn Rushd", "Ibn Sina", "Hakim Ajmal Khan"], 2],
    ["In Unani medicine, what does 'mizaj' mean?", ["Diet", "Temperament", "Pulse", "Fever"], 1],
    ["What is 'Ilaj bil Tadbeer'?", ["Treatment with drugs", "Treatment by surgery", "Regimenal therapy", "Treatment by diet"], 2],
  ],
  Siddha: [
    ["In which region did Siddha medicine mainly develop?", ["Kerala", "Tamil Nadu", "Bengal", "Kashmir"], 1],
    ["Who is traditionally regarded as the father of Siddha medicine?", ["Charaka", "Agastya (Agathiyar)", "Sushruta", "Thirumoolar"], 1],
    ["Which are the three humours in Siddha?", ["Vatham, Pitham, Kapham", "Dam, Balgham, Safra", "Sattva, Rajas, Tamas", "Udal, Uyir, Manam"], 0],
    ["How many Siddhars does the tradition speak of?", ["Seven", "Nine", "Twelve", "Eighteen"], 3],
    ["What does 'naadi' examination assess?", ["The tongue", "The eyes", "The pulse", "The urine"], 2],
  ],
  Naturopathy: [
    ["Which principle is the foundation of naturopathy?", ["Like cures like", "The healing power of nature", "Balance of three doshas", "Opposites cure opposites"], 1],
    ["What does hydrotherapy use as its treatment agent?", ["Water", "Sunlight", "Mud", "Magnets"], 0],
    ["Where is the National Institute of Naturopathy in India?", ["New Delhi", "Bengaluru", "Pune", "Jaipur"], 2],
    ["Which degree qualifies a naturopathy practitioner in India?", ["BAMS", "BHMS", "BNYS", "BUMS"], 2],
    ["In naturopathy, mud therapy is associated with which of the five elements?", ["Fire", "Earth", "Air", "Ether"], 1],
  ],
  Yoga: [
    ["Who compiled the Yoga Sutras?", ["Patanjali", "Swatmarama", "Vyasa", "Gheranda"], 0],
    ["How many limbs does Ashtanga yoga have?", ["Four", "Six", "Eight", "Ten"], 2],
    ["What is pranayama?", ["A cleansing technique", "Regulation of the breath", "A meditation posture", "Withdrawal of the senses"], 1],
    ["How many steps does the traditional Surya Namaskar have?", ["Eight", "Ten", "Twelve", "Fourteen"], 2],
    ["On which date is the International Day of Yoga observed?", ["21 March", "7 April", "21 June", "2 October"], 2],
  ],
  "Diet and Nutrition": [
    ["How much energy does one gram of fat provide?", ["4 kcal", "7 kcal", "9 kcal", "12 kcal"], 2],
    ["Vitamin D deficiency in children causes which condition?", ["Scurvy", "Rickets", "Beriberi", "Pellagra"], 1],
    ["What is the most common result of iron deficiency?", ["Anaemia", "Goitre", "Night blindness", "Osteoporosis"], 0],
    ["How is body mass index (BMI) calculated?", ["Weight in kg divided by height in metres", "Weight in kg divided by height in metres squared", "Height in cm divided by weight in kg", "Waist divided by hip measurement"], 1],
    ["Night blindness is an early sign of which deficiency?", ["Vitamin A", "Vitamin B1", "Vitamin K", "Zinc"], 0],
  ],
  Physiotherapy: [
    ["What does a goniometer measure?", ["Muscle strength", "Joint range of motion", "Grip strength", "Lung capacity"], 1],
    ["What does RICE stand for in the first care of a soft-tissue injury?", ["Rest, Ice, Compression, Elevation", "Rest, Immobilise, Cool, Exercise", "Rub, Ice, Compress, Exercise", "Rest, Ice, Cast, Elevation"], 0],
    ["What does TENS stand for?", ["Thermal Electrical Nerve Stimulation", "Transcutaneous Electrical Nerve Stimulation", "Targeted Electro Neural Stimulation", "Transdermal Electro Nerve Signal"], 1],
    ["Which muscle group straightens (extends) the knee?", ["Hamstrings", "Calf muscles", "Quadriceps", "Hip adductors"], 2],
    ["What is the normal resting breathing rate of an adult?", ["6 to 10 a minute", "12 to 20 a minute", "22 to 30 a minute", "30 to 40 a minute"], 1],
  ],
  "Psychology and Counselling": [
    ["What does CBT stand for?", ["Clinical Behaviour Training", "Cognitive Behavioural Therapy", "Client Based Treatment", "Cognitive Balance Technique"], 1],
    ["Who developed client-centred (person-centred) therapy?", ["Sigmund Freud", "Aaron Beck", "Carl Rogers", "B. F. Skinner"], 2],
    ["When may a counsellor break confidentiality?", ["When a relative asks", "When the client is late with payment", "When there is a serious risk of harm to the client or others", "Whenever the counsellor thinks it would help"], 2],
    ["The PHQ-9 questionnaire is used to screen for what?", ["Depression", "Dementia", "Alcohol use", "Autism"], 0],
    ["Who founded psychoanalysis?", ["Carl Jung", "Sigmund Freud", "Alfred Adler", "Ivan Pavlov"], 1],
  ],
  Veterinary: [
    ["What is the normal rectal temperature of a healthy adult dog?", ["About 36 to 37 °C", "About 38.3 to 39.2 °C", "About 40 to 41 °C", "About 41.5 to 42.5 °C"], 1],
    ["Rabies is caused by what kind of organism?", ["A bacterium", "A virus", "A fungus", "A protozoan"], 1],
    ["Which substance in chocolate is toxic to dogs?", ["Caffeine only", "Lactose", "Theobromine", "Tannin"], 2],
    ["Foot-and-mouth disease mainly affects which animals?", ["Birds", "Cloven-hoofed animals such as cattle and pigs", "Horses", "Dogs and cats"], 1],
    ["About how long is pregnancy in a cow?", ["About 5 months", "About 7 months", "About 9 months", "About 11 months"], 2],
  ],
};

const run = async () => {
  for (const [name, questions] of Object.entries(STARTERS)) {
    const stream = await prisma.consultingStream.findUnique({ where: { name }, select: { id: true, _count: { select: { questions: true } } } });
    if (!stream) { console.log(`${name}: no such stream, skipped`); continue; }
    if (stream._count.questions > 0) { console.log(`${name}: already has questions, left alone`); continue; }
    await prisma.streamQuestion.createMany({
      data: questions.map(([question, options, correctIndex], index) => ({ streamId: stream.id, question, options, correctIndex, sortOrder: index })),
    });
    console.log(`${name}: ${questions.length} questions added`);
  }
};

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
