import {prepareHandoffImport} from './handoff.js';
export async function offerHandoff({store,records,workspace,root=document.body}){
  const plan=await prepareHandoffImport({store,records});
  const parent=records.find(r=>r.kind==='problem');
  const dialog=document.createElement('dialog');
  const title=document.createElement('h2');title.textContent=`接续：${parent.payload.title}`;
  const note=document.createElement('p');note.textContent=`收到 ${records.length} 条题目和练习记录。${plan.copy?'此处已有不同版本或已删除记录；导入时会另建副本，双方完整保留。':'确认后将合并到此设备的匿名练习空间。'}内容不会自动上传云端。`;
  const preview=document.createElement('pre');const draft=records.find(r=>r.kind==='draft');preview.textContent=draft?.payload.code||parent.payload.statement.slice(0,500);
  const cancel=document.createElement('button');cancel.textContent='取消';cancel.onclick=()=>{dialog.close();dialog.remove();};
  const accept=document.createElement('button');accept.className='primary';accept.textContent=plan.copy?'保留双方并继续':'合并并继续';
  accept.onclick=async()=>{
    accept.disabled=true;
    try{const result=await store.restoreBackup({version:3,records:plan.records});if(result.conflicts.length)throw new Error('确认期间此设备数据已变化；请重新发起接续。');dialog.close();dialog.remove();await workspace.navigate('practice',plan.problemId);}
    catch(error){note.textContent=error.message;accept.disabled=false;}
  };
  const footer=document.createElement('footer');footer.append(cancel,accept);dialog.append(title,note,preview,footer);root.append(dialog);dialog.showModal();
}
