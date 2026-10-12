import { useState } from 'preact/hooks';
import { getSettings } from '../lib/storage.js';
import { effectiveFriction } from '../lib/friction.js';
import { Modal } from '../components/Modal.jsx';
import { FrictionFlow } from '../components/friction/FrictionFlow.jsx';

// Gate an action that weakens a commitment behind the user's friction level.
//   const { gate, frictionModal } = useFrictionGate();
//   gate({ title, description, confirmLabel }, async () => { ...do it... });
// With friction 'none' the action runs immediately (destructive actions still
// get a plain confirmation). Render {frictionModal}.
export function useFrictionGate() {
  const [request, setRequest] = useState(null);

  async function gate(options, action) {
    const settings = await getSettings();
    if (effectiveFriction(settings) === 'none' && !options.destructive) {
      await action();
      return;
    }
    setRequest({ ...options, settings, action });
  }

  const frictionModal = request && (
    <Modal visible title={request.title || 'Are you sure?'} onClose={() => setRequest(null)}>
      <FrictionFlow
        settings={request.settings}
        description={request.description}
        confirmLabel={request.confirmLabel}
        destructive={request.destructive}
        onCancel={() => setRequest(null)}
        onConfirm={async () => {
          const { action } = request;
          setRequest(null);
          await action();
        }}
      />
    </Modal>
  );

  return { gate, frictionModal };
}
