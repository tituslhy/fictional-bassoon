/** Test fixture authored independently from the validator. */
export function surfaceFixture() {
  return {
    version: 'v1.0',
    createSurface: {
      surfaceId: 'surface-1',
      catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
      components: [
        { id: 'root', component: 'Column', children: ['heading', 'choices', 'submit'] },
        { id: 'heading', component: 'Text', text: 'Choose your API framework' },
        {
          id: 'choices',
          component: 'ChoicePicker',
          label: 'Framework',
          variant: 'mutuallyExclusive',
          displayStyle: 'chips',
          value: { path: '/selection' },
          options: [
            { label: 'FastAPI', value: 'fastapi' },
            { label: 'Flask', value: 'flask' },
          ],
        },
        {
          id: 'submit',
          component: 'Button',
          child: 'submit-label',
          variant: 'primary',
          action: {
            event: { name: 'select_option', context: { selection: { path: '/selection' } } },
          },
        },
        { id: 'submit-label', component: 'Text', text: 'Get recommendation' },
      ],
      dataModel: { selection: [] },
    },
  };
}
