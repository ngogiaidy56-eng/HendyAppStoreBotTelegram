import React from 'react';
import AutomationSecretsForm from '../components/AutomationSecretsForm';

export default function Secrets({ token }: { token: string }) {
  return <AutomationSecretsForm token={token} />;
}
