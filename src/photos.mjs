const DB = 'tacker-preauditoria-fotos-v2';
let connection;
async function database() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error('No se pudo abrir el almacenamiento de fotos.'));
    });
  return connection;
}
export async function savePhoto(photo) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(photo);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(Error('No hay espacio para guardar la foto. Exportá el borrador antes de continuar.'));
  });
}
export async function getPhoto(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('photos').objectStore('photos').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('No se pudo recuperar la foto.'));
  });
}
export async function preparePhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15000000)
    throw Error('Seleccioná una foto JPG, PNG o WebP de hasta 15 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error('El archivo no contiene una imagen válida.');
  }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 60000000)
      throw Error('La resolución de la foto supera el límite permitido.');
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    const contentBase64 = dataUrl.split(',')[1];
    const size = Math.floor((contentBase64.length * 3) / 4);
    if (size > 1000000)
      throw Error('La foto sigue siendo demasiado grande. Seleccioná una imagen más pequeña.');
    const id = crypto.randomUUID();
    return { id, name: `evidencia-${id}.jpg`, mime: 'image/jpeg', size, contentBase64 };
  } finally {
    bitmap.close();
  }
}
export function photoMetadata({ id, name, mime, size }) {
  return { id, name, mime, size };
}
