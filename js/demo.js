// Dados de exemplo para conhecer o app.
import { D, uid, newSubject } from './store.js';
import { today, addDays, weekday } from './logic/dates.js';

export function loadDemo() {
  const d = D();
  const t = today();
  const start = addDays(t, -60);
  d.settings.semesterStart = start;
  d.settings.semesterEnd = addDays(t, 60);
  const mk = (name, difficulty, grades, schedule) => {
    const s = newSubject(name);
    s.difficulty = difficulty;
    s.attendance = { ...s.attendance, start, end: d.settings.semesterEnd, schedule, totalHours: 60 };
    s.grading.components.forEach((c, i) => (c.grade = grades[i] ?? null));
    return s;
  };
  const cito = mk('Citologia', 5, [9, 8.5], [{ weekday: 1, hours: 2 }, { weekday: 3, hours: 2 }]);
  const histo = mk('Histologia', 3, [9.5, 9], [{ weekday: 2, hours: 2 }]);
  const anato = mk('Anatomia', 4, [8.5, 9], [{ weekday: 4, hours: 3 }]);
  mk('Bioquímica', 2, [9.5, 10], [{ weekday: 5, hours: 2 }]);
  cito.grading.components.push({ id: uid(), code: 'P3', name: 'Prova 3', weight: 1, max: 10, grade: null });
  // algumas faltas
  let n = 0;
  for (let i = 60; i > 0; i--) {
    const day = addDays(t, -i);
    if ([1, 3].includes(weekday(day))) cito.attendance.records[day] = n++ % 7 === 3 ? 'F' : 'P';
  }
  const exam = (s, title, inDays, contents) => d.exams.push({ id: uid(), subjectId: s.id, title, date: addDays(t, inDays), time: '08:00', weight: '', dirty: true, contents: contents.map((title) => ({ id: uid(), title })) });
  exam(cito, 'N2', 6, ['Membrana plasmática', 'Transporte de membrana', 'Organelas', 'RE e Golgi', 'Citoesqueleto', 'Ciclo celular']);
  exam(histo, 'Seminário', 8, ['Tecido epitelial', 'Tecido conjuntivo', 'Cartilagem']);
  exam(anato, 'Prática', 13, ['Osteologia do membro superior', 'Músculos do braço', 'Plexo braquial', 'Vascularização']);
  const ev = (title, inDays, extra) => d.events.push({ id: uid(), title, date: addDays(t, inDays), endDate: '', startTime: '', endTime: '', location: '', notes: '', status: '', hours: 0, category: '', cert: '', dirty: true, ...extra });
  ev('Reunião da liga acadêmica', 4, { startTime: '18:00', endTime: '20:00', location: 'Aula aberta', status: 'confirmado', hours: 2, category: 'Ligas acadêmicas', cert: 'pendente' });
  ev('Simpósio de Neurociências', 26, { location: 'Apresentação de trabalho', status: 'inscrita', hours: 8, category: 'Eventos e congressos', cert: 'pendente' });
  ev('Congresso regional de medicina', 48, { status: 'pendente', hours: 12, category: 'Eventos e congressos' });
  ev('Projeto de extensão', -20, { hours: 12, category: 'Pesquisa e extensão', cert: 'salvo' });
  ev('Jornada acadêmica', -35, { hours: 20, category: 'Eventos e congressos', cert: 'salvo' });
  const c = (q, a) => d.cards.push({ id: uid(), subjectId: cito.id, examId: d.exams[0].id, type: 'basic', front: q, back: a, created: Date.now(), sentAt: null });
  c('Qual mecanismo transporta glicose para dentro da célula a favor do gradiente, sem gastar ATP?', 'Difusão facilitada por GLUT');
  c('Qual organela faz a glicosilação de proteínas?', 'Complexo de Golgi');
}
