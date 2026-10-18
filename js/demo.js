// Dados de exemplo para conhecer o app.
import { D, uid, newSubject, syncExamComponents, allComponents } from './store.js';
import { today, addDays, weekday } from './logic/dates.js';

export function loadDemo() {
  const d = D();
  const t = today();
  const start = addDays(t, -60);
  d.settings.semesterStart = start;
  d.settings.semesterEnd = addDays(t, 60);
  const mk = (name, difficulty, schedule, studyWeekdays = []) => {
    const s = newSubject(name);
    s.difficulty = difficulty;
    s.studyWeekdays = studyWeekdays;
    s.attendance = { ...s.attendance, start, end: d.settings.semesterEnd, schedule, totalHours: 60 };
    return s;
  };
  const exam = (s, kind, title, inDays, contents = [], extra = {}) => {
    const e = { id: uid(), subjectId: s.id, kind, title, date: addDays(t, inDays), time: '08:00', weight: '', points: '', dirty: true, removed: [], contents: contents.map((x) => ({ id: uid(), title: x })), ...extra };
    d.exams.push(e);
    return e;
  };
  const grade = (s, e, g) => {
    syncExamComponents(s, d);
    allComponents(s.grading).find((c) => c.examId === e.id).grade = g;
  };

  const cito = mk('Citologia', 5, [{ weekday: 1, hours: 2 }, { weekday: 3, hours: 2 }]);
  const histo = mk('Histologia', 3, [{ weekday: 2, hours: 2 }], [2, 4]);
  const anato = mk('Anatomia', 4, [{ weekday: 4, hours: 3 }]);
  const bioq = mk('Bioquímica', 2, [{ weekday: 5, hours: 2 }]);

  grade(cito, exam(cito, 'Prova', 'N1', -25), 9);
  exam(cito, 'Prova', 'N2', 6, ['Membrana plasmática', 'Transporte de membrana', 'Organelas', 'RE e Golgi', 'Citoesqueleto', 'Ciclo celular']);
  grade(cito, exam(cito, 'Trabalho', 'Trabalho em grupo', -10), 8.5);
  grade(histo, exam(histo, 'Prova', 'N1', -20), 9.5);
  exam(histo, 'Seminário', 'Seminário', 8, ['Tecido epitelial', 'Tecido conjuntivo', 'Cartilagem']);
  grade(anato, exam(anato, 'Prova', 'N1', -22), 8.5);
  exam(anato, 'Prática', 'Prática', 13, ['Osteologia do membro superior', 'Músculos do braço', 'Plexo braquial', 'Vascularização']);

  // Bioquímica no sistema modular
  bioq.grading = { mode: 'modular', scale: 100, passing: 60, minModule: null, components: [], modules: [
    { id: uid(), name: 'Módulo 1', weight: 1, components: [
      { id: uid(), code: 'COG', name: 'Avaliação cognitiva', max: 40, grade: 34 },
      { id: uid(), code: 'TUT', name: 'Tutoria', max: 30, grade: 27 },
      { id: uid(), code: 'HAB', name: 'Habilidades', max: 30, grade: 25 },
    ] },
    { id: uid(), name: 'Módulo 2', weight: 1, components: [
      { id: uid(), code: 'TUT2', name: 'Tutoria', max: 30, grade: null },
      { id: uid(), code: 'HAB2', name: 'Habilidades', max: 30, grade: null },
    ] },
  ] };
  const m2 = exam(bioq, 'Prova', 'Cognitiva M2', 15, ['Glicólise', 'Ciclo de Krebs', 'Cadeia respiratória'], { points: '40', moduleId: bioq.grading.modules[1].id });
  syncExamComponents(bioq, d);
  void m2;

  let n = 0;
  for (let i = 60; i > 0; i--) {
    const day = addDays(t, -i);
    if ([1, 3].includes(weekday(day))) cito.attendance.records[day] = n++ % 7 === 3 ? 'F' : 'P';
  }
  const ev = (title, inDays, extra) => d.events.push({ id: uid(), title, date: addDays(t, inDays), endDate: '', startTime: '', endTime: '', location: '', notes: '', status: '', hours: 0, category: '', cert: '', dirty: true, ...extra });
  ev('Reunião da liga acadêmica', 4, { startTime: '18:00', endTime: '20:00', location: 'Aula aberta', status: 'confirmado', hours: 2, category: 'Ligas acadêmicas', cert: 'pendente' });
  ev('Simpósio de Neurociências', 26, { location: 'Apresentação de trabalho', status: 'inscrita', hours: 8, category: 'Eventos e congressos', cert: 'pendente' });
  ev('Congresso regional de medicina', 48, { status: 'pendente', hours: 12, category: 'Eventos e congressos' });
  ev('Projeto de extensão', -20, { hours: 12, category: 'Pesquisa e extensão', cert: 'salvo' });
  ev('Jornada acadêmica', -35, { hours: 20, category: 'Eventos e congressos', cert: 'salvo' });
}
