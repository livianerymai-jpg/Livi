// Re-desenha a tela atual sem salvar nada (para mudanças só visuais).
let fn = () => {};
export const setRerender = (f) => (fn = f);
export const rerender = () => fn();
