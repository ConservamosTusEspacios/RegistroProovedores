const SUPABASE_URL = "https://sgnxbqectwhdqwgtpzeo.supabase.co";
const SUPABASE_KEY = "sb_publishable_5eobgpi7SzIjMjCzzDc9lA_nbLraq69";
const STORAGE_BUCKET = "documentos-proveedores";

const form = document.querySelector("#providerForm");
const statusEl = document.querySelector("#status");
const reviewModal = document.querySelector("#reviewModal");
const successModal = document.querySelector("#successModal");
const reviewContent = document.querySelector("#reviewContent");
const submitBtn = document.querySelector("#reviewBtn");
const confirmBtn = document.querySelector("#confirmBtn");
const especialidad = document.querySelector("#especialidad");
const otroWrap = document.querySelector("#otroWrap");
const especialidadOtro = document.querySelector("#especialidadOtro");
const telefono = document.querySelector("#telefono");
const nit = document.querySelector("#nit");

const MAX_SIZE = 6 * 1024 * 1024;

function esc(value){
  return String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function safeFileName(name){
  const parts=String(name).split(".");
  const ext=parts.length>1 ? "."+parts.pop().replace(/[^a-zA-Z0-9]/g,"").toLowerCase() : "";
  const base=parts.join(".").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)||"archivo";
  return base+ext;
}
function makeReference(){
  return window.crypto?.randomUUID ? crypto.randomUUID() : `sol-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}
function allFiles(){
  return [
    ...[...form.querySelectorAll('input[type="file"]')].flatMap(input=>[...input.files].map(file=>({file, key:input.name})))
  ];
}
function validateFiles(){
  const files=allFiles();
  const invalid=files.find(x=>x.file.size>MAX_SIZE);
  if(invalid){
    return `El archivo "${invalid.file.name}" supera el límite de 6 MB.`;
  }
  const rut=form.querySelector('[name="rut"]').files[0];
  if(!rut) return "El RUT es obligatorio.";
  if(!/\.pdf$/i.test(rut.name) && rut.type!=="application/pdf") return "El RUT debe estar en formato PDF.";
  return "";
}
function normalizePhone(){
  telefono.value=telefono.value.replace(/\D/g,"").slice(0,10);
}
telefono.addEventListener("input",normalizePhone);

nit.addEventListener("input",()=>{
  let v=nit.value.replace(/\s/g,"").toUpperCase();
  v=v.replace(/[^0-9-]/g,"");
  if(v.includes("-")){
    const parts=v.split("-");
    v=parts[0].replace(/\D/g,"").slice(0,9)+"-"+(parts[1]||"").replace(/\D/g,"").slice(0,1);
  }else{
    const digits=v.replace(/\D/g,"");
    if(digits.length>9) v=digits.slice(0,9)+"-"+digits.slice(9,10);
    else v=digits;
  }
  nit.value=v;
});

especialidad.addEventListener("change",()=>{
  const other=especialidad.value==="Otro";
  otroWrap.classList.toggle("hidden",!other);
  especialidadOtro.required=other;
  if(!other) especialidadOtro.value="";
});

function validateBusinessRules(){
  normalizePhone();
  nit.dispatchEvent(new Event("input"));
  if(!form.checkValidity()){
    form.reportValidity();
    return "Revisa los campos obligatorios.";
  }
  if(telefono.value.length!==10) return "El número de teléfono debe tener exactamente 10 números.";
  if(!/^\d{9}-\d$/.test(nit.value)) return "El NIT debe tener el formato 900123456-7.";
  if(especialidad.value==="Otro" && !especialidadOtro.value.trim()) return "Especifica cuál es la especialidad.";
  return validateFiles();
}
function value(name){
  const el=form.querySelector(`[name="${name}"]`);
  return el ? (el.value||"").trim() : "";
}
function reviewRow(label,val,important=false){
  return `<div class="review-row ${important?"important":""}"><span>${esc(label)}</span><strong>${esc(val||"No registrado")}</strong></div>`;
}
function openReview(){
  const error=validateBusinessRules();
  if(error){statusEl.textContent=error; return false;}
  statusEl.textContent="";
  const specialty=especialidad.value==="Otro" ? especialidadOtro.value.trim() : especialidad.value;
  const files=allFiles();
  reviewContent.innerHTML=[
    reviewRow("Razón social",value("razonSocial")),
    reviewRow("Identificación",`${value("tipoIdentificacion")} · ${value("identificacion")}`,"important"),
    reviewRow("Régimen IVA",value("regimenIVA")),
    reviewRow("Ciudad",value("ciudad")),
    reviewRow("Dirección",value("direccion"),"important"),
    reviewRow("Especialidad",specialty),
    reviewRow("Experiencia",value("experiencia")?`${value("experiencia")} años`:"No registrada"),
    reviewRow("Cobertura",value("cobertura")),
    reviewRow("Contacto",value("contacto")),
    reviewRow("Teléfono",value("telefono"),"important"),
    reviewRow("Correo",value("correo"),"important"),
    reviewRow("Documentos",`${files.length} archivo${files.length===1?"":"s"} adjunto${files.length===1?"":"s"}`)
  ].join("");
  reviewModal.hidden=false;
  document.body.style.overflow="hidden";
  return true;
}

form.addEventListener("submit",e=>{
  e.preventDefault();
  openReview();
});

document.querySelector("#editBtn").addEventListener("click",()=>{
  reviewModal.hidden=true;
  document.body.style.overflow="";
});
document.querySelector(".overlay").addEventListener("click",e=>{
  const modal=e.target.closest(".modal");
  if(modal===reviewModal){reviewModal.hidden=true;document.body.style.overflow="";}
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
    reviewModal.hidden=true;
    document.body.style.overflow="";
  }
});

async function insertarSolicitud(payload){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/solicitudes_proveedores`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":SUPABASE_KEY,
      "Prefer":"return=minimal"
    },
    body:JSON.stringify(payload)
  });
  if(!response.ok){
    const err=await response.json().catch(()=>({}));
    throw new Error(err.message||err.details||`Error HTTP ${response.status}`);
  }
}
async function subirArchivo(file,reference,prefix,index){
  const filename=`${prefix}-${String(index+1).padStart(2,"0")}-${safeFileName(file.name)}`;
  const response=await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodeURIComponent(reference)}/${encodeURIComponent(filename)}`,{
    method:"POST",
    headers:{
      "apikey":SUPABASE_KEY,
      "Content-Type":file.type||"application/octet-stream",
      "x-upsert":"false"
    },
    body:file
  });
  if(!response.ok){
    const err=await response.json().catch(()=>({}));
    throw new Error(`No se pudo subir "${file.name}": ${err.message||err.error||`HTTP ${response.status}`}`);
  }
}
function setLoading(loading,text){
  confirmBtn.disabled=loading;
  confirmBtn.textContent=loading?(text||"Enviando…"):"Confirmar y enviar →";
}

confirmBtn.addEventListener("click",async()=>{
  const error=validateBusinessRules();
  if(error){reviewModal.hidden=true;document.body.style.overflow="";statusEl.textContent=error;return;}

  const reference=makeReference();
  const specialty=especialidad.value==="Otro" ? especialidadOtro.value.trim() : especialidad.value;
  const fd=new FormData(form);
  const payload={
    razon_social:value("razonSocial"),
    tipo_identificacion:value("tipoIdentificacion"),
    identificacion:value("identificacion"),
    regimen_iva:value("regimenIVA")||null,
    ciudad:value("ciudad"),
    direccion:value("direccion"),
    especialidad:specialty,
    experiencia:value("experiencia")?Number(value("experiencia")):null,
    cobertura:value("cobertura"),
    descripcion:value("descripcion"),
    contacto:value("contacto"),
    cargo:value("cargo")||null,
    telefono:value("telefono"),
    correo:value("correo"),
    comentarios:value("comentarios")||null,
    estado:"Pendiente",
    documentos_ref:reference
  };

  setLoading(true,"Guardando solicitud…");
  try{
    await insertarSolicitud(payload);

    const inputs=[
      ["RUT","rut"],["CAMARA","camaraComercio"],["CERTIFICACIONES","certificaciones"],["PORTAFOLIO","portafolio"],["OTRO","otrosDocumentos"]
    ];
    let total=0;
    for(const [prefix,key] of inputs){
      const files=[...(form.querySelector(`[name="${key}"]`)?.files||[])];
      for(let i=0;i<files.length;i++){
        total++;
        setLoading(true,`Subiendo documento ${total}…`);
        await subirArchivo(files[i],reference,prefix,i);
      }
    }

    reviewModal.hidden=true;
    successModal.hidden=false;
    form.reset();
    otroWrap.classList.add("hidden");
    especialidadOtro.required=false;
    statusEl.textContent="";
  }catch(error){
    console.error(error);
    statusEl.textContent="No pudimos completar la solicitud: "+(error.message||"error desconocido");
    reviewModal.hidden=true;
  }finally{
    setLoading(false);
    document.body.style.overflow=successModal.hidden?"":"hidden";
  }
});

document.querySelector("#closeSuccess").addEventListener("click",()=>{
  successModal.hidden=true;
  document.body.style.overflow="";
  window.scrollTo({top:0,behavior:"smooth"});
});
