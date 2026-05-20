Pod::Spec.new do |s|
  s.name = 'MCEmojiPicker'
  s.version = '1.2.6'
  s.license = 'MIT'
  s.summary = 'Emoji picker for iOS like on MacOS'
  s.homepage = 'https://github.com/Jeanno/MCEmojiPicker'
  s.authors = { 'Ivan Izyumkin' => 'izzyumkin@gmail.com' }

  s.source = { :git => 'https://github.com/Jeanno/MCEmojiPicker.git', :tag => '1.2.6' }
  s.source_files = 'Sources/MCEmojiPicker/**/*.swift'
  s.resource_bundle = {
    'MCEmojiPicker' => [
      'Sources/MCEmojiPicker/**/*.lproj/*.strings',
      'Sources/MCEmojiPicker/Resources/EmojiDefinitions/*.json'
    ]
  }
  s.swift_version = '4.2'
  s.platform = :ios, '11.1'
end
