import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../src/services/queryCache';
import { useCartMutation } from '../../src/services/useCartMutation';
function Probe() {
  const mutation=useCartMutation();
  useEffect(()=>{ window.__otherCartWrite=()=>mutation.mutateAsync({kind:'remove',itemID:1}).catch(error=>error.message); });
  return null;
}
export function mount() {
  const node=document.createElement('div'); document.body.append(node);
  const root=createRoot(node); root.render(createElement(QueryClientProvider,{client:queryClient},createElement(Probe)));
}
