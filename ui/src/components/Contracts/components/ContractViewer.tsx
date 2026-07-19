import React from 'react';
import { Websites, WhiteList, BlackList } from './ContractComponents';

function ContractViewer({ I, contractI }: { I: Record<string, any>, contractI: Record<string, any> }) {
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [wipeConfirm, setWipeConfirm] = React.useState("");
  const [showDelete, setShowDelete] = React.useState(false);
  const [showWipe, setShowWipe] = React.useState(false);
  const serviceName = contractI.data.service;

  if (serviceName === "*") return null;

  return (
    <div className="max-w-[800px] mx-auto">
      <div className="rounded-lg border overflow-hidden mb-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span className="font-medium">{serviceName}</span>
          <button onClick={contractI.toggleHide} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
            <i className={contractI.hide ? "fas fa-angle-right" : "fas fa-angle-down"}></i>
          </button>
        </div>
        {!contractI.hide && (
          <>
            <div className="p-4">
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}><u>Websites/IPs</u> :</span>
              <Websites contractI={contractI} />
              <WhiteList contractI={contractI} />
              <BlackList contractI={contractI} />
            </div>
            <div className="px-4 py-2.5 border-t flex flex-wrap gap-2" style={{ borderColor: 'var(--color-border)' }}>
              <button className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--color-primary-600)' }} onClick={() => contractI.edit()}>
                change terms <i className="fas fa-pencil ml-1.5"></i>
              </button>
              <button className="text-sm font-medium hover:opacity-80" style={{ color: '#bb2124' }} onClick={() => setShowDelete(!showDelete)}>
                delete terms <i className="fas fa-trash ml-1.5"></i>
              </button>
              <button className="text-sm font-medium hover:opacity-80" style={{ color: '#bb2124' }} onClick={() => setShowWipe(!showWipe)}>
                wipe data <i className="fas fa-fire ml-1.5"></i>
              </button>
            </div>
          </>
        )}
      </div>
      {showDelete && (
        <div className="rounded-lg border overflow-hidden mb-4" style={{ borderColor: '#bb2124', backgroundColor: 'var(--color-surface)' }}>
          <div className="p-4" style={{ color: '#bb2124' }}>
            <p className="font-medium">Delete Service Terms Record</p>
            <p className="text-sm">Type service name to confirm:</p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={serviceName}
              className="px-3 py-1.5 rounded-lg border text-sm w-[200px] mt-1"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            />
            <button
              onClick={() => {
                if (deleteConfirm === serviceName) {
                  I.deleteService(serviceName);
                  setShowDelete(false);
                } else {
                  I.setStatus("Type the service name to confirm deletion");
                }
              }}
              className="mt-1 px-3 py-1.5 text-sm font-medium rounded-lg text-white"
              style={{ backgroundColor: 'var(--color-danger)' }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {showWipe && (
        <div className="rounded-lg border overflow-hidden mb-4" style={{ borderColor: 'crimson', backgroundColor: 'var(--color-surface)' }}>
          <div className="p-4" style={{ color: 'crimson' }}>
            <p className="font-medium">Wipe All Service Data</p>
            <p className="text-sm">Type service name to confirm:</p>
            <input
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value)}
              placeholder={serviceName}
              className="px-3 py-1.5 rounded-lg border text-sm w-[200px] mt-1"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            />
            <button
              onClick={() => {
                if (wipeConfirm === serviceName) {
                  I.wipeServiceData(serviceName);
                  setShowWipe(false);
                } else {
                  I.setStatus("Type the service name to confirm wipe");
                }
              }}
              className="mt-1 px-3 py-1.5 text-sm font-medium rounded-lg text-white"
              style={{ backgroundColor: 'var(--color-neutral-800)' }}
            >
              Wipe
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContractViewer;