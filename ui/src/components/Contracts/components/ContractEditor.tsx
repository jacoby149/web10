import React from 'react';
import { CircleX, Check, RotateCcw, ChevronDown, ChevronRight, Globe, User, Ban } from 'lucide-react';
import { Websites, WhiteList, BlackList } from './ContractComponents';
import SiteEditor from './SiteEditor';
import { WhiteListEditor, BlackListEditor } from './ListEditor';
import { Button } from '@/components/ui/button';

function ContractEditor({ I, contractI }: { I: Record<string, any>, contractI: Record<string, any> }) {
  const [editorMode, setEditorMode] = React.useState("all");
  return (
    <div className="mx-auto max-w-[800px]">
      <div className="mb-4 overflow-hidden rounded border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {contractI.mode === "edit" && editorMode === "all" && (
              <button
                type="button"
                onClick={contractI.clearChanges}
                aria-label="Discard unsaved changes"
                className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="contract-editor-discard"
              >
                <CircleX className="h-5 w-5" strokeWidth={1.5} />
              </button>
            )}
            <span className="font-medium text-foreground">{contractI.data.service}</span>
          </div>
          {contractI.mode === "edit" ? (
            editorMode === "all" ? (
              <Button variant="brand" size="sm" onClick={contractI.saveChanges} data-testid="contract-editor-save">
                Save changes <Check className="ml-1.5 h-4 w-4" strokeWidth={1.5} />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-warning text-warning hover:text-warning"
                onClick={() => setEditorMode("all")}
                data-testid="contract-editor-back"
              >
                Go back <RotateCcw className="ml-1.5 h-4 w-4" strokeWidth={1.5} />
              </Button>
            )
          ) : (
            <button
              type="button"
              onClick={contractI.toggleHide}
              aria-label={contractI.hide ? 'Expand contract details' : 'Collapse contract details'}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="contract-editor-toggle"
            >
              {contractI.hide ? <ChevronRight className="h-4 w-4" strokeWidth={1.5} /> : <ChevronDown className="h-4 w-4" strokeWidth={1.5} />}
            </button>
          )}
        </div>
        {!contractI.hide && (
          <div className="p-4">
            {editorMode === "site" && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Websites/IPs:</span>
                <Websites contractI={contractI} />
                <SiteEditor contractI={contractI} />
              </div>
            )}
            {editorMode === "all" && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Websites/IPs:</span>
                <Websites contractI={contractI} />
                <WhiteList contractI={contractI} />
                <BlackList contractI={contractI} />
              </div>
            )}
            {editorMode === "allow" && (
              <>
                <WhiteList contractI={contractI} />
                <WhiteListEditor contractI={contractI} />
              </>
            )}
            {editorMode === "block" && (
              <>
                <BlackList contractI={contractI} />
                <BlackListEditor contractI={contractI} />
              </>
            )}
          </div>
        )}
        {editorMode === "all" && (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5">
            <Button variant="ghost" size="sm" className="text-brand-300 hover:text-brand-300" onClick={() => setEditorMode("site")} data-testid="contract-editor-sites-tab">
              Sites <Globe className="ml-1.5 h-4 w-4" strokeWidth={1.5} />
            </Button>
            <Button variant="ghost" size="sm" className="text-brand-300 hover:text-brand-300" onClick={() => setEditorMode("allow")} data-testid="contract-editor-allowed-tab">
              Allowed <User className="ml-1.5 h-4 w-4" strokeWidth={1.5} />
            </Button>
            <Button variant="ghost" size="sm" className="text-brand-300 hover:text-brand-300" onClick={() => setEditorMode("block")} data-testid="contract-editor-blocked-tab">
              Blocked <Ban className="ml-1.5 h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ContractEditor;