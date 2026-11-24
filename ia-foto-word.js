/* ia-foto-word.js
 * Tambahan untuk internal-audit.html:
 *  1) Foto bukti ditempatkan dalam FRAME tetap 2:1 (mendatar, 16,9 x 8,45 cm). Auditor menggeser/zoom foto di frame.
 *  2) Tombol "Word": ekspor temuan ke .docx A4 satu halaman. Tinggi frame dikunci (exact) sehingga TIDAK PERNAH melebihi 1 halaman.
 * Pasang: tambahkan  <script src="ia-foto-word.js"></script>  tepat sebelum </body> (setelah script utama).
 * Database: jalankan sekali di Supabase SQL editor:
 *   alter table public.ia_temuan add column if not exists foto text;
 */
(()=>{
const FW=1690, FH=845;            // piksel frame (rasio 2:1) = 16,9 x 8,45 cm di Word
const EMU=3600;                   // EMU per piksel (100 px = 1 cm)
const xe=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- gaya ----------
const st=document.createElement('style');
st.textContent=`
.mdl .lc.wide{width:min(720px,100%)}
.fe{border:2px dashed var(--line);border-radius:12px;background:#fff;overflow:hidden;margin:6px 0 8px;line-height:0}
.fe canvas{width:100%;height:auto;aspect-ratio:2/1;touch-action:none;cursor:grab;display:block}
.fe canvas:active{cursor:grabbing}
.fz{display:flex;align-items:center;gap:10px;margin-bottom:6px}.fz span{font-size:12px;font-weight:700;color:var(--mut)}
.fz input[type=range]{flex:1;padding:0;margin:0;border:0;background:transparent}
.fbt{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.fh{font-size:11px;color:var(--mut);margin:0 0 10px;line-height:1.5}
.tm .ph{margin:8px 0 2px;width:100%;max-width:440px;aspect-ratio:2/1;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:8px;display:block}
`;
document.head.append(st);

// ---------- editor frame foto ----------
function editor(host,init){
  host.innerHTML=`<label>Foto bukti (frame mendatar 2:1)</label>
  <input type="file" class="fi" accept="image/*">
  <div class="fe"><canvas width="${FW}" height="${FH}"></canvas></div>
  <div class="fz"><span>Zoom</span><input class="zr" type="range" min="0.1" max="4" step="any" value="1" disabled></div>
  <div class="fbt"><button type="button" class="btn g bs" data-a="fit">Tampil utuh</button><button type="button" class="btn g bs" data-a="fill">Isi frame</button><button type="button" class="btn r bs" data-a="clr">Hapus foto</button></div>
  <p class="fh">Geser foto dengan jari/mouse, zoom dengan slider atau scroll. Bagian di dalam frame persis yang tercetak di Word, jadi tidak akan melebihi 1 halaman. Foto tinggi: pakai &ldquo;Tampil utuh&rdquo; atau potong sesuai bagian penting.</p>`;
  const cv=host.querySelector('canvas'),x=cv.getContext('2d'),zr=host.querySelector('.zr'),fi=host.querySelector('.fi');
  let im=null,sc=1,ox=0,oy=0,contain=1,cover=1,dr=null;
  const draw=()=>{x.fillStyle='#fff';x.fillRect(0,0,FW,FH);
    if(!im){x.fillStyle='#94a3b8';x.font='700 46px sans-serif';x.textAlign='center';x.fillText('Pilih foto, lalu atur posisinya di frame ini',FW/2,FH/2+16);return}
    const w=im.width*sc,h=im.height*sc;x.drawImage(im,FW/2+ox-w/2,FH/2+oy-h/2,w,h)};
  const setSc=v=>{sc=Math.max(+zr.min,Math.min(+zr.max,v));zr.value=sc;draw()};
  const setIm=b=>{im=b;contain=Math.min(FW/b.width,FH/b.height);cover=Math.max(FW/b.width,FH/b.height);
    zr.min=contain*.4;zr.max=Math.max(cover,contain)*4;zr.disabled=false;ox=oy=0;setSc(contain)};
  fi.onchange=async()=>{const f=fi.files[0];if(!f)return;
    try{setIm(await createImageBitmap(f))}catch{toast('Foto tidak dapat dibaca')}};
  zr.oninput=()=>{sc=+zr.value;draw()};
  host.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{const a=b.dataset.a;
    if(a==='clr'){im=null;zr.disabled=true;fi.value='';draw();return}
    if(!im)return;ox=oy=0;setSc(a==='fit'?contain:cover)});
  cv.onpointerdown=e=>{if(!im)return;dr={x:e.clientX,y:e.clientY,ox,oy};cv.setPointerCapture(e.pointerId)};
  cv.onpointermove=e=>{if(!dr)return;const k=FW/cv.getBoundingClientRect().width;ox=dr.ox+(e.clientX-dr.x)*k;oy=dr.oy+(e.clientY-dr.y)*k;draw()};
  cv.onpointerup=cv.onpointercancel=()=>{dr=null};
  cv.onwheel=e=>{if(!im)return;e.preventDefault();setSc(sc*Math.exp(-e.deltaY*.0015))};
  draw();
  if(init){const i=new Image();i.onload=()=>createImageBitmap(i).then(setIm);i.src=init}
  return{get:()=>im?cv.toDataURL('image/jpeg',.86):null,has:()=>!!im};
}

// ---------- form catat temuan (menggantikan yang lama, ditambah frame foto) ----------
window.temuanForm=function(){
  const sc=DOCS.filter(d=>inScope(d,J));let ed;
  const m=modal(`<h2>Catat Temuan</h2><p>${where(J)}</p><label>Kategori</label><select id="tk">${KAT.map(k=>`<option>${k}</option>`).join('')}</select><label>Klausul ISO / dokumen acuan</label><input id="tc" placeholder="Mis. 7.5.3">
  <label>Dokumen terkait (opsional)</label><select id="td"><option value="">- tidak ada -</option>${sc.map(d=>`<option value="${esc(d.id)}">${esc(d.kode)} &middot; ${esc(d.judul)}</option>`).join('')}</select>
  <label>Uraian temuan</label><textarea id="tu"></textarea><label>Bukti objektif</label><textarea id="tb"></textarea><label>PIC / auditee</label><input id="tp"><div id="fh"></div>`,
  async()=>{const u=$('#tu').value.trim();if(u.length<5)throw new Error('Uraian temuan wajib diisi');
    const o={jadwal_id:J.id,kategori:$('#tk').value,klausul:$('#tc').value.trim()||null,dokumen_id:$('#td').value||null,uraian:u,bukti:$('#tb').value.trim()||null,pic:$('#tp').value.trim()||null,dibuat_oleh:S.nama};
    const foto=ed.get();if(foto)o.foto=foto;
    const r=await sb.from('ia_temuan').insert(o);
    if(r.error)throw new Error(/foto/i.test(r.error.message)?'Kolom "foto" belum ada. Jalankan: alter table public.ia_temuan add column foto text;':r.error.message);
    toast('Temuan dicatat');findTab()},'Catat');
  m.querySelector('.lc').classList.add('wide');
  ed=editor(m.querySelector('#fh'));
};

// ---------- daftar temuan (menggantikan yang lama: foto + tombol Word) ----------
window.findTab=async function(){const ct=$('#ct');ct.innerHTML='<div class="empty">Memuat temuan...</div>';
  const r=await sb.from('ia_temuan').select('*').eq('jadwal_id',J.id).order('nomor');
  if(r.error){ct.innerHTML='<div class="empty">Gagal memuat temuan: '+esc(r.error.message)+'</div>';return}FIND=r.data;
  const dk=id=>{const d=DOCS.find(x=>String(x.id)===String(id));return d?esc(d.kode):''};
  ct.innerHTML=`<div class="bh"><h3>Temuan (${FIND.length})</h3><button class="btn bs" id="nt">+ Catat Temuan</button></div>`+(FIND.map(t=>`<div class="tm"><div class="h"><b>${tnm(t)}</b><span class="tag k-${esc(t.kategori)}">${esc(t.kategori)}</span><span class="tag o">${esc(t.status)}</span>${t.klausul?`<span class="m">Klausul ${esc(t.klausul)}</span>`:''}${t.dokumen_id?`<span class="m">&middot; ${dk(t.dokumen_id)}</span>`:''}</div><p>${esc(t.uraian)}</p>${t.bukti?`<p class="m"><b>Bukti:</b> ${esc(t.bukti)}</p>`:''}${t.foto?`<img class="ph" src="${t.foto}" alt="Foto bukti">`:''}<p class="m">PIC: ${esc(t.pic||'-')} &middot; dicatat ${esc(t.dibuat_oleh||'-')}</p>${t.akar||t.tindakan?`<p class="m"><b>Akar masalah:</b> ${esc(t.akar||'-')}<br><b>Tindakan korektif:</b> ${esc(t.tindakan||'-')}${t.due?'<br><b>Batas waktu:</b> '+tgl(t.due):''}</p>`:''}<div class="hr"><button class="btn bs" data-w="${t.id}">Word</button><button class="btn g bs" data-p="${t.id}">${t.foto?'Ubah Foto':'Tambah Foto'}</button>${S.mode==='email'?`<button class="btn g bs" data-f="${t.id}">Tindak Lanjut</button>${S.admin?`<button class="btn r bs" data-d="${t.id}">Hapus</button>`:''}`:''}</div></div>`).join('')||'<div class="empty">Belum ada temuan untuk audit ini.</div>');
  const by=id=>FIND.find(t=>t.id===id);
  $('#nt').onclick=()=>temuanForm();
  document.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>tindakForm(by(b.dataset.f)));
  document.querySelectorAll('[data-w]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await exportWord(by(b.dataset.w))}catch(e){toast('Gagal: '+(e.message||e))}b.disabled=false});
  document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>fotoForm(by(b.dataset.p)));
  document.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{if(!confirm('Hapus temuan ini?'))return;const x=await sb.from('ia_temuan').delete().eq('id',b.dataset.d);if(x.error){toast('Gagal: '+x.error.message);return}findTab()});
};

function fotoForm(t){let ed;
  const m=modal(`<h2>Foto Bukti ${tnm(t)}</h2><div id="fh"></div>`,async()=>{
    const r=await sb.from('ia_temuan').update({foto:ed.get()}).eq('id',t.id);
    if(r.error)throw new Error(/foto/i.test(r.error.message)?'Kolom "foto" belum ada. Jalankan: alter table public.ia_temuan add column foto text;':r.error.message);
    toast('Foto disimpan');findTab()});
  m.querySelector('.lc').classList.add('wide');ed=editor(m.querySelector('#fh'),t.foto);
}

// ---------- ekspor Word (.docx) satu halaman ----------
const loadZip=()=>window.JSZip?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';s.onload=ok;s.onerror=()=>no(new Error('Gagal memuat pustaka Word'));document.head.append(s)});
const FONT='<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
const runs=(txt,o={})=>String(txt??'').split('\n').map((l,i)=>`<w:r><w:rPr>${FONT}${o.b?'<w:b/>':''}${o.i?'<w:i/>':''}<w:sz w:val="${o.sz||21}"/></w:rPr>${i?'<w:br/>':''}<w:t xml:space="preserve">${xe(l)}</w:t></w:r>`).join('');
const P=(inner,o={})=>`<w:p><w:pPr><w:spacing w:before="${o.sb||0}" w:after="${o.sa||0}" w:line="240" w:lineRule="auto"/>${o.jc?`<w:jc w:val="${o.jc}"/>`:''}</w:pPr>${inner}</w:p>`;
const BD=['top','left','bottom','right','insideH','insideV'].map(k=>`<w:${k} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('');
const NB=['top','left','bottom','right','insideH','insideV'].map(k=>`<w:${k} w:val="nil"/>`).join('');
const tc=(w,body,extra='')=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${extra}</w:tcPr>${body}</w:tc>`;
const tbl=(grid,rows,o={})=>`<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders>${o.nb?NB:BD}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${o.m??40}" w:type="dxa"/><w:left w:w="${o.m??100}" w:type="dxa"/><w:bottom w:w="${o.m??40}" w:type="dxa"/><w:right w:w="${o.m??100}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map(g=>`<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`;

async function exportWord(t){
  await loadZip();
  const dk=DOCS.find(x=>String(x.id)===String(t.dokumen_id));
  const info=[['Departemen / Bagian',J.dept+(J.bagian?' > '+J.bagian:'')],['Tanggal audit',tgl(J.tanggal)],['Auditor',J.auditor||'-'],['Kategori temuan',t.kategori],['Klausul / dokumen',[t.klausul?'Klausul '+t.klausul:'',dk?dk.kode+' - '+dk.judul:''].filter(Boolean).join(' / ')||'-'],['PIC / Auditee',t.pic||'-'],['Uraian temuan',t.uraian||'-'],['Bukti objektif',t.bukti||'-']];
  const rows=info.map(([a,b])=>`<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(2500,P(runs(a,{b:1})))}${tc(7138,P(runs(b)))}</w:tr>`).join('');
  const WE=FW*EMU,HE=FH*EMU;
  const pic=t.foto?`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${WE}" cy="${HE}"/><wp:docPr id="1" name="Foto bukti"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="foto.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${WE}" cy="${HE}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    :runs('(foto bukti belum dilampirkan)',{i:1});
  // baris frame: tinggi DIKUNCI (exact) 8,8 cm -> tidak bisa melar ke halaman 2
  const frame=tbl([9638],`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="4990" w:hRule="exact"/></w:trPr>${tc(9638,P(pic,{jc:'center'}),'<w:vAlign w:val="center"/>')}</w:tr>`,{m:0});
  const nb=(sp)=>'\u00A0'.repeat(sp);
  const line='<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:before="900" w:after="0"/><w:ind w:left="500" w:right="500"/></w:pPr></w:p>';
  const sig=lbl=>P(runs('( '+nb(22)+' )*'+lbl,{sz:20}),{jc:'center',sb:40});
  const col=(ttl,lbl)=>tc(4819,P(runs(ttl),{jc:'center'})+line+sig(lbl)+P(runs('( '+nb(22)+' )*tgl',{sz:20}),{jc:'center',sb:40}));
  const ttd=tbl([4819,4819],`<w:tr><w:trPr><w:cantSplit/></w:trPr>${col('Diketahui','Auditee')}${col('Disetujui','Kabag./Mng')}</w:tr>`,{nb:1});
  const body=P(runs('FORM TEMUAN AUDIT INTERNAL',{b:1,sz:28}),{jc:'center'})+P(runs('PT Karya Indah Multiguna  |  '+tnm(t),{sz:20}),{jc:'center',sa:120})
    +tbl([2500,7138],rows)+P(runs('Dokumentasi'+(t.klausul?' (Klausul '+t.klausul+')':''),{i:1}),{sb:120,sa:60})+frame+P('',{sb:120})+ttd;
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const z=new JSZip();
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+(t.foto?'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/foto.jpg"/>':'')+'</Relationships>');
  z.file('word/document.xml',doc);
  if(t.foto)z.file('word/media/foto.jpg',t.foto.split(',')[1],{base64:true});
  const blob=await z.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Temuan-${tnm(t)}-${String(J.dept).replace(/[^\w-]+/g,'_')}.docx`;document.body.append(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);toast('File Word dibuat');
}
})();
