import RemoteSearchSelect from './RemoteSearchSelect'

export default function SelectField(props) {
  return (
    <div className="flex items-center w-full [&_.ant-select]:h-8 [&_.ant-select-selector]:h-8 [&_.ant-select-selector]:flex! [&_.ant-select-selector]:items-center!">
      <RemoteSearchSelect {...props} />
    </div>
  )
}
