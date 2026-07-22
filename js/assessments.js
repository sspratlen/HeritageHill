/* ================================================================
   Heritage Hill — Assessment scoring (pure functions)
   ================================================================ */
const Assessments = {
  // answers: { [contentRowId]: 1..5 }, questions: [{id, code}] where code ∈ D/I/S/C
  scoreDisc(answers, questions) {
    const totals = { D: 0, I: 0, S: 0, C: 0 };
    questions.forEach(q => { totals[q.code] += (answers[q.id] || 0); });
    const order = ['D', 'I', 'S', 'C'];   // book box order = tiebreak order
    const ranked = order.slice().sort((a, b) =>
      totals[b] - totals[a] || order.indexOf(a) - order.indexOf(b));
    return { totals, result: ranked[0] + ranked[1] };
  },

  // answers: { [contentRowId]: 1..3 }, questions: [{id, code}] code ∈ A..X,
  // gifts: [{code, extra:{name}}]
  scoreGifts(answers, questions, gifts) {
    const totals = {};
    gifts.forEach(g => { totals[g.code] = 0; });
    questions.forEach(q => { totals[q.code] += (answers[q.id] || 0); });
    const sorted = gifts.slice().sort((a, b) =>
      totals[b.code] - totals[a.code] || a.code.localeCompare(b.code));
    const thirdScore = sorted.length >= 3 ? totals[sorted[2].code] : 0;
    const top = sorted.filter((g, i) => i < 3 || totals[g.code] === thirdScore);
    return { totals, result: top.map(g => (g.extra && g.extra.name) || g.code) };
  },

  // Splits a content dump (from SupaDB.getAssessmentContent) by kind.
  splitContent(rows) {
    const by = k => rows.filter(r => r.kind === k).sort((a, b) => a.sort - b.sort);
    return {
      discQuestions: by('disc_question'),
      discBlends:    by('disc_blend'),
      giftQuestions: by('gift_question'),
      gifts:         by('gift'),
    };
  },
};

// Run Assessments.selfTest() in the browser console to verify scoring.
Assessments.selfTest = function () {
  const dq = [];
  ['D','I','S','C'].forEach((c, s) => {
    for (let i = 0; i < 5; i++) dq.push({ id: c + i, code: c });
  });
  // All D answers 5, I=4, S=2, C=1 → totals D25 I20 S10 C5 → "DI"
  const a1 = {}; dq.forEach(q => {
    a1[q.id] = { D: 5, I: 4, S: 2, C: 1 }[q.code];
  });
  const r1 = Assessments.scoreDisc(a1, dq);
  console.assert(r1.result === 'DI' && r1.totals.D === 25, 'disc basic', r1);
  // Tie: D and I both 25 → tiebreak D first → "DI"
  const a2 = {}; dq.forEach(q => { a2[q.id] = { D: 5, I: 5, S: 2, C: 1 }[q.code]; });
  console.assert(Assessments.scoreDisc(a2, dq).result === 'DI', 'disc tie');

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('');
  const gifts = letters.map((c, i) => ({ code: c, sort: i + 1, extra: { name: 'Gift' + c } }));
  const gq = [];
  for (let n = 1; n <= 72; n++) gq.push({ id: 'q' + n, code: letters[(n - 1) % 24] });
  // A=3s (9), B=3s (9), C=2s (6), everything else 1 (3) → top3 A,B,C
  const a3 = {}; gq.forEach(q => {
    a3[q.id] = q.code === 'A' || q.code === 'B' ? 3 : q.code === 'C' ? 2 : 1;
  });
  const r3 = Assessments.scoreGifts(a3, gq, gifts);
  console.assert(JSON.stringify(r3.result) === '["GiftA","GiftB","GiftC"]', 'gifts basic', r3);
  // Tie at 3rd: C and D both 6 → both included (4 results)
  const a4 = {}; gq.forEach(q => {
    a4[q.id] = q.code === 'A' || q.code === 'B' ? 3 : (q.code === 'C' || q.code === 'D') ? 2 : 1;
  });
  const r4 = Assessments.scoreGifts(a4, gq, gifts);
  console.assert(r4.result.length === 4, 'gifts tie at third', r4);
  console.log('Assessments.selfTest: all assertions ran (failures above if any)');
};
