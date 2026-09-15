/**
 * Development-only seed for the reviewed Grameen America AI Fluency survey.
 * Run after migration 0008 in development only. It creates or resolves only
 * Grameen America's explicitly authorized development tenant/domain and never
 * substitutes a public or arbitrary tenant.
 */
import { writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import * as schema from "../shared/schema";
import { exportModelDefinition } from "../server/services/model-export-service";

type Item = { text: string; answers: string[]; scores: number[]; na?: number[]; scored?: boolean; optional?: boolean; dimension: string };
const dimensions = [
  ["getting-started", "Getting Started"],
  ["day-to-day", "How You Work Day to Day"],
  ["information-safety", "Keeping Information Safe"],
  ["better-results", "Getting Better Results"],
] as const;

const intro = "This is a quick way for us to learn where you are starting from with AI, so we can put you on the right track for AI Fluency Days. It is not a test.\n\nThere are no wrong answers. We are not grading anyone, and we will not share your individual answers with anyone. Please answer the way you actually work today, not the way you think you are supposed to work. If a question does not match your job, choose the option that says so and move on.\n\nMost people finish in 15 to 20 minutes. Take the time you need. This survey is also available in Spanish.";
const spanishIntro = "Esta es una manera rápida de saber desde dónde parte cada persona con la inteligencia artificial (IA), para poder ubicar a cada quien en el grupo que más le sirva durante los Días de Fluidez en IA. No es un examen.\n\nNo hay respuestas incorrectas. No estamos calificando a nadie y no vamos a compartir sus respuestas individuales con nadie. Por favor conteste según cómo trabaja usted hoy, no según cómo cree que debería trabajar. Si una pregunta no corresponde a su trabajo, marque la opción que lo dice y siga adelante.\n\nLa mayoría de las personas termina en 15 a 20 minutos. Tómese el tiempo que necesite.";

const items: Item[] = [
  { dimension:"getting-started", scored:false, text:"Do you have an AI tool that work gave you, such as Microsoft 365 Copilot?", answers:["Yes, and I use it","Yes, but I have not used it much","No","I am not sure"], scores:[0,0,0,0] },
  { dimension:"getting-started", scored:false, text:"Outside of work, do you use an AI service on your own account, such as ChatGPT, Gemini, or Claude? Free accounts count.", answers:["Yes, often","Yes, sometimes","No","I am not sure what these are"], scores:[0,0,0,0] },
  { dimension:"getting-started", text:"If you use a personal AI account that work did not give you, is it all right to put work information into it, such as a client's name or details?", answers:["No. Work information should only go into tools the organization has approved.","Yes, as long as I take the client's name out first.","Yes, as long as I do not save the answer.","I am not sure."], scores:[100,0,0,25] },
  { dimension:"day-to-day", text:"On a normal workday, how often do you use an AI assistant to help with your work?", answers:["Never","Rarely","Sometimes, about once or twice a week","Often, most days","Every day"], scores:[0,25,50,75,100] },
  { dimension:"day-to-day", text:"When you write an email or a document, which is closest to what you do?", answers:["I write everything myself, without AI.","I ask AI to write it and I send it with little or no review.","I ask AI to write it, then I rewrite the whole thing myself.","I start from a similar example or my own notes and ask AI to build a new version.","I ask AI to write a first version, then I read it carefully and edit it."], scores:[0,25,50,75,100] },
  { dimension:"day-to-day", na:[5], text:"After you meet with a client, how do you write up your notes?", answers:["I write them all myself.","I use AI to turn my notes into a write-up, then I check it before I save it.","I use AI and save what it gives me without checking.","I ask a coworker to help me write them up.","This is not part of my job."], scores:[0,100,25,50,0] },
  { dimension:"day-to-day", na:[6], text:"When you need to explain a product, a form, or a policy to a client in simple language, or move something between English and Spanish, how often does AI help you?", answers:["Never","Rarely","Sometimes","Often","Almost every time","This is not part of my job."], scores:[0,25,50,75,100,0] },
  { dimension:"day-to-day", na:[5], text:"You have a large spreadsheet and you need to look for patterns or trends in it. What do you do?", answers:["I do it by hand in Excel, without AI.","I ask AI for a summary or a chart, then I check the numbers myself.","I ask AI and use its answer without checking it.","I ask a coworker to do it.","This is not part of my job."], scores:[25,100,25,50,0] },
  { dimension:"day-to-day", na:[5], text:"After a long meeting, how do you find out the main points and what you need to do next?", answers:["I use my own notes, or I watch the recording again.","I use AI to make a summary and a list of tasks, then I check it.","I use AI to make a summary and I share it right away without checking.","I ask a coworker to write up the notes.","This is not part of my job."], scores:[0,100,25,50,0] },
  { dimension:"day-to-day", text:"How often do you use AI to help you come up with ideas?", answers:["Never","Rarely","Sometimes, about once or twice a week","Often, most days","Every day"], scores:[0,25,50,75,100] },
  { dimension:"information-safety", text:"A client shares her financial situation and her immigration status with you on an intake form. You want help writing up her case. Which of these is all right to do?", answers:["Use an AI tool the organization has approved, and follow our rules about what may be entered.","Paste her information into any AI chat, because large companies keep data safe.","Take out her name, then paste the rest into any free AI tool.","Use any AI tool on the internet; they are all safe for this."], scores:[100,0,0,0] },
  { dimension:"information-safety", text:"In an AI tool that the organization has set up for work, what information does it use to answer your questions?", answers:["Information from our organization that you already have permission to see, plus general knowledge from its training.","Only general knowledge from its training. It cannot see anything from our organization.","All company information, including files you are not allowed to open.","Only public websites.","I am not sure."], scores:[100,0,0,0,25] },
  { dimension:"information-safety", text:"What happens to what you type into an AI tool that the organization has set up for work?", answers:["It stays inside the organization's protected environment and is not used to train the public AI.","Everything you type is published for anyone to see.","It is deleted right away.","It is used to improve the AI for everyone in the world.","I am not sure."], scores:[100,0,25,0,25] },
  { dimension:"information-safety", text:"When an AI answer shows links or sources, how often do you open them and check them?", answers:["Never","Rarely","Sometimes","Often","Always"], scores:[0,25,50,75,100] },
  { dimension:"better-results", text:"If the first answer AI gives you is not what you need, what do you do next?", answers:["I stop using AI and do the task myself.","I take the first answer and do not try to improve it.","I ask a coworker to try asking for me.","I change my request, add more detail, and try again."], scores:[0,0,25,100] },
  { dimension:"better-results", text:"What gets you the best results when the task is big or complicated?", answers:["Give a clear, detailed request and break the work into smaller steps.","Put everything into one long request and see what happens.","Keep the request very short so the AI has more freedom.","Send the same request again without changing anything."], scores:[100,50,0,0] },
  { dimension:"better-results", text:"When a new AI tool becomes available at work, what do you usually do?", answers:["I keep using the tools I already know.","I wait to see other people use it first.","I am eager to try it and start using it wherever it helps.","I try it on a small task first to see if it helps."], scores:[0,25,75,100] },
  { dimension:"better-results", text:"How sure do you feel about using AI for a bigger piece of work with several steps, such as a report or a presentation?", answers:["Not sure at all","A little sure","Somewhat sure","Sure","Very sure"], scores:[0,25,50,75,100] },
  { dimension:"better-results", optional:true, text:"A reusable skill is a saved set of instructions and tools for a task you do over and over, so you do not have to explain it each time. Copilot instructions, Cowork skills, and Claude skills all work this way. Which is closest to you?", answers:["I am not familiar with reusable skills. I type my instructions again each time.","I use skills that other people have published, but I have not made my own.","I have written a personal skill for a task I do often.","I write skills, test them, and share them so my team can reuse them."], scores:[0,50,75,100] },
];

const es: Array<[string, string[]]> = [
  ["¿Tiene usted alguna herramienta de IA que le haya dado el trabajo, como Microsoft 365 Copilot?",["Sí, y la uso","Sí, pero casi no la he usado","No","No estoy seguro(a)"]],
  ["Fuera del trabajo, ¿usa usted algún servicio de IA en su propia cuenta, como ChatGPT, Gemini o Claude? Las cuentas gratuitas también cuentan.",["Sí, con frecuencia","Sí, a veces","No","No sé qué son estos servicios"]],
  ["Si usted usa una cuenta personal de IA que no le dio el trabajo, ¿está bien poner en ella información del trabajo, por ejemplo el nombre o los datos de una clienta?",["No. La información del trabajo solo debe ir en las herramientas que la organización ha aprobado.","Sí, siempre y cuando primero le quite el nombre a la clienta.","Sí, siempre y cuando no guarde la respuesta.","No estoy seguro(a)."]],
  ["En un día normal de trabajo, ¿con qué frecuencia usa un asistente de IA para ayudarle con sus tareas?",["Nunca","Casi nunca","A veces, una o dos veces por semana","Con frecuencia, casi todos los días","Todos los días"]],
  ["Cuando escribe un correo electrónico o un documento, ¿qué se parece más a lo que usted hace?",["Escribo todo yo, sin IA.","Le pido a la IA que lo escriba y lo envío casi sin revisarlo.","Le pido a la IA que lo escriba y después lo vuelvo a escribir todo yo.","Empiezo con un ejemplo parecido o con mis propias notas y le pido a la IA que arme una versión nueva.","Le pido a la IA una primera versión y después la leo con cuidado y la edito."]],
  ["Después de reunirse con una clienta, ¿cómo escribe sus notas?",["Las escribo todas yo.","Uso la IA para convertir mis notas en un resumen, y lo reviso antes de guardarlo.","Uso la IA y guardo lo que me da, sin revisarlo.","Le pido a un compañero o a una compañera de trabajo que me ayude a escribirlas.","Esto no es parte de mi trabajo."]],
  ["Cuando necesita explicarle a una clienta un producto, un formulario o una política en palabras sencillas, o pasar algo del inglés al español o del español al inglés, ¿con qué frecuencia le ayuda la IA?",["Nunca","Casi nunca","A veces","Con frecuencia","Casi siempre","Esto no es parte de mi trabajo."]],
  ["Tiene una hoja de cálculo grande y necesita buscar patrones o tendencias en ella. ¿Qué hace?",["Lo hago a mano en Excel, sin IA.","Le pido a la IA un resumen o una gráfica, y después reviso los números yo.","Le pido a la IA y uso su respuesta sin revisarla.","Le pido a un compañero o a una compañera de trabajo que lo haga.","Esto no es parte de mi trabajo."]],
  ["Después de una reunión larga, ¿cómo se entera de los puntos principales y de lo que le toca hacer?",["Uso mis propias notas, o vuelvo a ver la grabación.","Uso la IA para hacer un resumen y una lista de tareas, y después los reviso.","Uso la IA para hacer un resumen y lo comparto de inmediato, sin revisarlo.","Le pido a un compañero o a una compañera de trabajo que escriba las notas.","Esto no es parte de mi trabajo."]],
  ["¿Con qué frecuencia usa la IA para que le ayude a pensar en ideas nuevas?",["Nunca","Casi nunca","A veces, una o dos veces por semana","Con frecuencia, casi todos los días","Todos los días"]],
  ["Una clienta le comparte su situación económica y su estatus migratorio en un formulario de admisión. Usted quiere ayuda para redactar su caso. ¿Cuál de estas opciones está bien?",["Usar una herramienta de IA aprobada por la organización y seguir nuestras reglas sobre qué se puede escribir en ella.","Copiar su información en cualquier chat de IA, porque las empresas grandes protegen los datos.","Quitarle el nombre y copiar el resto en cualquier herramienta de IA gratuita.","Usar cualquier herramienta de IA del internet; todas son seguras para esto."]],
  ["En una herramienta de IA que la organización preparó para el trabajo, ¿qué información usa para contestar sus preguntas?",["Información de nuestra organización que usted ya tiene permiso de ver, más conocimiento general de su entrenamiento.","Solo conocimiento general de su entrenamiento. No puede ver nada de nuestra organización.","Toda la información de la organización, incluso archivos que usted no tiene permiso de abrir.","Solo páginas públicas del internet.","No estoy seguro(a)."]],
  ["¿Qué pasa con lo que usted escribe en una herramienta de IA que la organización preparó para el trabajo?",["Se queda dentro del entorno protegido de la organización y no se usa para entrenar la IA pública.","Todo lo que escribe se publica para que cualquiera lo vea.","Se borra de inmediato.","Se usa para mejorar la IA de todo el mundo.","No estoy seguro(a)."]],
  ["Cuando una respuesta de la IA muestra enlaces o fuentes, ¿con qué frecuencia los abre y los revisa?",["Nunca","Casi nunca","A veces","Con frecuencia","Siempre"]],
  ["Si la primera respuesta que le da la IA no es la que usted necesita, ¿qué hace después?",["Dejo de usar la IA y hago la tarea yo.","Me quedo con la primera respuesta y no trato de mejorarla.","Le pido a un compañero o a una compañera de trabajo que lo intente por mí.","Cambio mi petición, doy más detalles y lo intento otra vez."]],
  ["¿Qué le da los mejores resultados cuando la tarea es grande o complicada?",["Dar una petición clara y detallada, y dividir el trabajo en pasos más pequeños.","Poner todo en una sola petición larga y ver qué pasa.","Hacer la petición muy corta para darle más libertad a la IA.","Volver a mandar la misma petición sin cambiarle nada."]],
  ["Cuando hay una herramienta de IA nueva en el trabajo, ¿qué hace usted normalmente?",["Sigo usando las herramientas que ya conozco.","Espero a ver a otras personas usarla primero.","Tengo muchas ganas de probarla y empiezo a usarla donde me sirva.","La pruebo primero en una tarea pequeña para ver si me sirve."]],
  ["¿Cuánta confianza tiene usted para usar la IA en un trabajo más grande, de varios pasos, como un informe o una presentación?",["Ninguna confianza","Poca confianza","Algo de confianza","Bastante confianza","Mucha confianza"]],
  ["Una habilidad reutilizable es un conjunto de instrucciones y herramientas que usted guarda para una tarea que hace una y otra vez, para no tener que explicarla cada vez. Las instrucciones de Copilot, las habilidades de Cowork y las habilidades de Claude funcionan así. ¿Qué se parece más a usted?",["No conozco las habilidades reutilizables. Escribo mis instrucciones de nuevo cada vez.","Uso habilidades que otras personas han publicado, pero no he creado las mías.","He creado una habilidad propia para una tarea que hago seguido.","Creo habilidades, las pruebo y las comparto para que mi equipo también las use."]],
];

async function main() {
  const exportPath = "attached_assets/personal-ai-skills-grameen.model";
  const exportData = {
    formatVersion: "1.1",
    exportedAt: new Date().toISOString(),
    model: {
      name: "Personal AI Skills - Grameen", slug: "personal-ai-skills-grameen",
      description: "A short survey before AI Fluency Days", version: "1.0",
      estimatedTime: "15 to 20 minutes", status: "draft", featured: false,
      allowAnonymousResults: false, hideScoreAndNarratives: false, assessmentMode: "scored",
      respondentContent: {
        introduction: intro,
        completionMessage: "That is the end of the survey. Thank you for taking the time.",
        sectionInstructions: {
          "getting-started": "These first questions are about what you have access to. There is no right answer and nothing here counts for or against you.",
        },
        optionalSectionInstruction: "This last question is for people who have already gone further with AI. If none of it sounds familiar, you are finished. Thank you.",
      },
      scoringConfig: { method: "mean_answer_values", remediation: { questionOrder: 3, incorrectAnswerScores: [0, 25], message: "Complete the client-information and approved-tools training." } },
      imageUrl: null, maturityScale: [
        { id: "foundation", name: "Foundation", description: "First hands-on use on a real task from her own week, plus the ground rules on client information", minScore: 0, maxScore: 40 },
        { id: "practitioner", name: "Practitioner", description: "Better requests, checking the output, and knowing when not to trust it", minScore: 41, maxScore: 70 },
        { id: "advanced", name: "Advanced", description: "Multi-step work, reusable instructions, and helping colleagues in the Foundation track", minScore: 71, maxScore: 100 },
      ], generalResources: null,
    },
    dimensions: dimensions.map(([key, label], index) => ({ key, label, description: null, order: index + 1 })),
    translations: { es: { name: "Habilidades personales con la IA - Grameen", description: "Una encuesta breve antes de los Días de Fluidez en IA", introduction: spanishIntro, completionMessage: "Aquí termina la encuesta. Gracias por su tiempo.", sectionInstructions: { "getting-started": "Estas primeras preguntas son sobre las herramientas a las que usted tiene acceso. No hay respuesta correcta y nada de esto cuenta a su favor ni en su contra." }, optionalSectionInstruction: "Esta última pregunta es para las personas que ya han avanzado más con la IA. Si nada de esto le suena conocido, ya terminó. Muchas gracias.", resultLabels: { Foundation: "Fundamentos", Practitioner: "Profesional", Advanced: "Avanzado" }, dimensions: { "getting-started": { label: "Para comenzar" }, "day-to-day": { label: "Su trabajo del día a día" }, "information-safety": { label: "Proteger la información" }, "better-results": { label: "Obtener mejores resultados" } } } },
    questions: items.map((item, index) => ({
      dimensionKey: item.dimension, text: item.text, type: "multiple_choice", order: index + 1,
      minValue: null, maxValue: null, unit: null, placeholder: null,
      improvementStatement: null, resourceTitle: null, resourceLink: null, resourceDescription: null,
      isScored: item.scored ?? true, isOptional: item.optional ?? false,
      translations: { es: { text: es[index][0] } },
      answers: item.answers.map((text, answerIndex) => ({
        text, score: item.scores[answerIndex], order: answerIndex + 1, typeKey: null,
        improvementStatement: null, resourceTitle: null, resourceLink: null, resourceDescription: null,
        isNotApplicable: item.na?.includes(answerIndex + 1) ?? false,
        translations: { es: es[index][1][answerIndex] },
      })),
    })),
  };
  await writeFile(exportPath, JSON.stringify(exportData, null, 2));
  if (process.argv.includes("--export-only")) {
    console.log(JSON.stringify({ exportPath }));
    return;
  }
  const [domain] = await db.select().from(schema.tenantDomains)
    .where(eq(schema.tenantDomains.domain, "grameenamerica.org")).limit(1);
  let tenant: schema.Tenant;
  if (domain) {
    const associatedTenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, domain.tenantId) });
    if (!associatedTenant || associatedTenant.name !== "Grameen America") {
      throw new Error("grameenamerica.org is associated with a non-Grameen tenant; refusing to modify it.");
    }
    tenant = associatedTenant;
  } else {
    const matchingTenants = await db.select().from(schema.tenants)
      .where(eq(schema.tenants.name, "Grameen America"));
    if (matchingTenants.length > 1) {
      throw new Error("Multiple Grameen America tenants exist; refusing ambiguous domain assignment.");
    }
    tenant = matchingTenants[0] ?? (await db.insert(schema.tenants).values({
      name: "Grameen America",
      autoCreateUsers: false,
      allowUserSelfProvisioning: false,
    }).returning())[0];
    await db.insert(schema.tenantDomains).values({
      tenantId: tenant.id,
      domain: "grameenamerica.org",
      // This seed does not configure or assert domain/SSO verification.
      verified: false,
    });
  }
  const existing = await db.query.models.findFirst({ where: eq(schema.models.slug, "personal-ai-skills-grameen") });
  if (existing) {
    if (existing.ownerTenantId !== tenant.id || existing.visibility !== "private" || existing.status !== "draft") {
      throw new Error(`Model slug exists with unexpected ownership or visibility (${existing.id}); refusing to modify it.`);
    }
    const [association] = await db.select().from(schema.modelTenants).where(
      eq(schema.modelTenants.modelId, existing.id),
    ).limit(1);
    if (!association || association.tenantId !== tenant.id) {
      throw new Error(`Model slug exists without the required Grameen tenant association (${existing.id}); refusing to modify it.`);
    }
    const { exportData: persistedExport } = await exportModelDefinition(existing.id);
    await writeFile(exportPath, JSON.stringify(persistedExport, null, 2));
    console.log(JSON.stringify({ modelId: existing.id, tenantId: tenant.id, exportPath, existing: true }));
    return;
  }

  const spanishQuestions = Object.fromEntries(es.map(([text, answers], i) => [String(i + 1), {
    text, answers: Object.fromEntries(answers.map((answer, j) => [String(j + 1), answer])),
  }]));
  const model = (await db.insert(schema.models).values({
    slug: "personal-ai-skills-grameen",
    name: "Personal AI Skills - Grameen",
    description: "A short survey before AI Fluency Days",
    estimatedTime: "15 to 20 minutes",
    status: "draft",
    visibility: "private",
    modelClass: "individual",
    ownerTenantId: tenant.id,
    maturityScale: [
      { id: "foundation", name: "Foundation", description: "First hands-on use on a real task from her own week, plus the ground rules on client information", minScore: 0, maxScore: 40 },
      { id: "practitioner", name: "Practitioner", description: "Better requests, checking the output, and knowing when not to trust it", minScore: 41, maxScore: 70 },
      { id: "advanced", name: "Advanced", description: "Multi-step work, reusable instructions, and helping colleagues in the Foundation track", minScore: 71, maxScore: 100 },
    ],
    scoringConfig: { method: "mean_answer_values", remediation: { questionOrder: 3, incorrectAnswerScores: [0, 25], message: "Complete the client-information and approved-tools training." } },
    respondentContent: { introduction: intro, completionMessage: "That is the end of the survey. Thank you for taking the time.", sectionInstructions: { "getting-started": "These first questions are about what you have access to. There is no right answer and nothing here counts for or against you." }, optionalSectionInstruction: "This last question is for people who have already gone further with AI. If none of it sounds familiar, you are finished. Thank you." },
    contentTranslations: { es: { name: "Habilidades personales con la IA - Grameen", description: "Una encuesta breve antes de los Días de Fluidez en IA", introduction: spanishIntro, completionMessage: "Aquí termina la encuesta. Gracias por su tiempo.", sectionInstructions: { "getting-started": "Estas primeras preguntas son sobre las herramientas a las que usted tiene acceso. No hay respuesta correcta y nada de esto cuenta a su favor ni en su contra." }, optionalSectionInstruction: "Esta última pregunta es para las personas que ya han avanzado más con la IA. Si nada de esto le suena conocido, ya terminó. Muchas gracias.", resultLabels: { Foundation: "Fundamentos", Practitioner: "Profesional", Advanced: "Avanzado" }, dimensions: { "getting-started": { label: "Para comenzar" }, "day-to-day": { label: "Su trabajo del día a día" }, "information-safety": { label: "Proteger la información" }, "better-results": { label: "Obtener mejores resultados" } }, questions: spanishQuestions } },
  }).returning())[0];
  await db.insert(schema.modelTenants).values({ modelId: model.id, tenantId: tenant.id });
  const dimRows = await Promise.all(dimensions.map(async ([key, label], index) =>
    (await db.insert(schema.dimensions).values({ modelId: model.id, key, label, order: index + 1 }).returning())[0]));
  const dimByKey = Object.fromEntries(dimRows.map(row => [row.key, row.id]));
  for (const [index, item] of items.entries()) {
    const question = (await db.insert(schema.questions).values({ modelId: model.id, dimensionId: dimByKey[item.dimension], text: item.text, type: "multiple_choice", order: index + 1, isScored: item.scored ?? true, isOptional: item.optional ?? false }).returning())[0];
    await db.insert(schema.answers).values(item.answers.map((text, answerIndex) => ({
      questionId: question.id, text, score: item.scores[answerIndex], order: answerIndex + 1,
      isNotApplicable: item.na?.includes(answerIndex + 1) ?? false,
    })));
  }
  // Re-export from the created record to validate its portable representation.
  const { exportData: persistedExport } = await exportModelDefinition(model.id);
  await writeFile(exportPath, JSON.stringify(persistedExport, null, 2));
  console.log(JSON.stringify({ modelId: model.id, tenantId: tenant.id, exportPath }));
}

main().finally(() => pool.end());