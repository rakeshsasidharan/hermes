/**
 * @jest-environment node
 */
import { renderToString } from 'react-dom/server';
import { LoginForm } from '@/app/login/login-form';

// Emulates the server reference Next.js passes for a 'use server' import.
// React calls $$FORM_ACTION during SSR to get the progressive-enhancement
// form attributes (method/action/encType plus hidden action-id fields), and
// useActionState binds the action first, so bind() must preserve the
// reference just as real server references do.
jest.mock('@/app/login/actions', () => {
  type Reference = ((...args: unknown[]) => unknown) & {
    $$FORM_ACTION: () => Record<string, unknown>;
  };

  function serverReference(): Reference {
    const ref = jest.fn() as unknown as Reference;
    ref.$$FORM_ACTION = () => ({
      name: '$ACTION_ID_login',
      action: '',
      encType: 'multipart/form-data',
      method: 'POST',
      data: null,
    });
    ref.bind = () => serverReference();
    return ref;
  }

  return { loginAction: serverReference() };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function renderFormTag() {
  const html = renderToString(<LoginForm />);
  const formTag = html.match(/<form[^>]*>/)?.[0];
  if (!formTag) throw new Error('form tag not rendered');
  return formTag;
}

// A submit that happens before hydration must never fall back to a native GET,
// which would put the username and password in the URL query string (#266).
describe('LoginForm server render', () => {
  test('renders the form as a POST', () => {
    expect(renderFormTag()).toMatch(/method="POST"/i);
  });

  test('never renders the form as a GET', () => {
    expect(renderFormTag()).not.toMatch(/method="get"/i);
  });

  test('posts as multipart form data to the server action', () => {
    expect(renderFormTag()).toMatch(/enctype="multipart\/form-data"/i);
  });

  test('wires the submit to the server action id', () => {
    const html = renderToString(<LoginForm />);
    expect(html).toMatch(/<(button|input)[^>]*name="\$ACTION_ID_login"/);
  });
});
