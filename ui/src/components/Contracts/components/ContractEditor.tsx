import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';
import SiteEditor from './SiteEditor';
import { WhiteListEditor, BlackListEditor } from './ListEditor';

function ContractEditor({ I, contractI }: { I: Record<string, any>, contractI: Record<string, any> }) {
  const [editorMode, setEditorMode] = React.useState("all");
  return (
    <div className="max-w-[800px] mx-auto">
      <div className="rounded-lg border overflow-hidden mb-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            {contractI.mode === "edit" && editorMode === "all" ?
              <i onClick={contractI.clearChanges} className="fa fa-2x fa-circle-xmark font-weight-bold cursor-pointer hover:opacity-70" style={{ color: 'var(--color-text-muted)' }}></i> : ""
            }
            <span className="font-medium">{contractI.data.service}</span>
          </div>
          {contractI.mode === "edit" ?
            editorMode === "all" ?
              <button onClick={contractI.saveChanges} className="px-4 py-1.5 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90" style={{ backgroundColor: 'var(--color-primary-600)' }}>
                Save Changes <i className="fa fa-check ml-2.5 font-weight-bold"></i>
              </button> :
              <button onClick={() => setEditorMode("all")} className="px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors hover:opacity-80" style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}>
                Go Back <i className="fa fa-rotate-left ml-2.5 font-weight-bold"></i>
              </button>
            :
            <button onClick={contractI.toggleHide} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
              <i className={contractI.hide ? "fas fa-angle-right" : "fas fa-angle-down"}></i>
            </button>
          }
        </div>
        {!contractI.hide && (
          <div className="p-4">
            {editorMode !== "site" ? "" :
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}><u>Websites/IPs</u> :</span>
                <Websites contractI={contractI} />
                <div className="mt-1.5" />
                <SiteEditor contractI={contractI} />
              </div>
            }
            {editorMode !== "all" ? "" :
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}><u>Websites/IPs</u> :</span>
                <Websites contractI={contractI} />
                <div className="mt-1.5" />
                <WhiteList contractI={contractI} />
                <BlackList contractI={contractI} />
              </div>
            }
            {editorMode !== "allow" ? "" :
              <>
                <WhiteList contractI={contractI} />
                <WhiteListEditor contractI={contractI} />
              </>
            }
            {editorMode !== "block" ? "" :
              <>
                <BlackList contractI={contractI} />
                <BlackListEditor contractI={contractI} />
              </>
            }
          </div>
        )}
        {editorMode === "all" ?
          <div className="px-4 py-2.5 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--color-border)' }}>
            <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => setEditorMode("site")}>
              sites <i className="fas fa-globe ml-1.5"></i>
            </button>
            <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => setEditorMode("allow")}>
              allowed <i className="fas fa-user ml-1.5"></i>
            </button>
            <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => setEditorMode("block")}>
              blocked <i className="fas fa-road-barrier ml-1.5"></i>
            </button>
          </div> : ""
        }
      </div>
    </div>
  );
}

export default ContractEditor;