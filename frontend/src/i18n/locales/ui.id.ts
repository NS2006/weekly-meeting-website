import type { Messages } from './en';

/** Ui: Bahasa Indonesia, the same keys as ui.en.ts. */
export const uiId: Messages['ui'] = {
  modal: {
    close: 'Tutup',
  },
  alert: {
    dismiss: 'Tutup pesan',
  },
  spinner: {
    loading: 'Memuat',
  },
  confirm: {
    cancel: 'Batal',
  },
  backToTop: 'Kembali ke atas',
  backToTopShort: 'Atas',
  pagination: {
    label: 'Halaman',
    previous: 'Sebelumnya',
    next: 'Berikutnya',
    page: 'Halaman {{page}}',
    status: 'Halaman {{page}} dari {{last}}',
    atEnd: '{{label}}, di akhir',
  },
  typeName: {
    prompt: 'Untuk konfirmasi, ketik <name/> di kotak di bawah',
  },
  imageViewer: {
    picture: 'Gambar',
    pictureOf: 'Gambar: {{alt}}',
    zoomOut: 'Perkecil',
    zoomIn: 'Perbesar',
    close: 'Tutup',
    hintMouse: 'Gulir atau klik untuk memperbesar, seret untuk melihat sekeliling, Esc untuk menutup.',
    hintTouch: 'Cubit atau ketuk untuk memperbesar, seret untuk melihat sekeliling.',
  },
};
