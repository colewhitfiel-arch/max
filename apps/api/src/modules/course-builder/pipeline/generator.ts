import { Injectable } from '@nestjs/common';
import {
  AiService,
  type LessonResult,
  LessonResultSchema,
  type LessonVars,
  type SurveyResult,
  SurveyResultSchema,
  type TopicMaterial,
  TopicMaterialSchema,
  type TopicMaterialVars,
  buildRequest,
  lessonPrompt,
  renderAtomsForPrompt,
  surveyPrompt,
  topicMaterialPrompt,
} from '@edu/ai';
import type { KnowledgeAtom } from '@edu/contracts';

/** Вызовы модели пайплайна — только через AiService и промпты реестра (@edu/ai). */
@Injectable()
export class CourseGenerator {
  constructor(private readonly ai: AiService) {}

  async writeMaterial(
    vars: TopicMaterialVars,
    userId: string,
    signal?: AbortSignal,
  ): Promise<TopicMaterial> {
    const req = buildRequest(topicMaterialPrompt, vars, {
      metadata: { userId },
      ...(signal ? { signal } : {}),
    });
    return (await this.ai.chatJson(req, TopicMaterialSchema)).data;
  }

  async surveyWindow(
    atoms: KnowledgeAtom[],
    instructions: string | undefined,
    userId: string,
    signal?: AbortSignal,
  ): Promise<SurveyResult['nodes']> {
    const req = buildRequest(
      surveyPrompt,
      { atomsText: renderAtomsForPrompt(atoms), ...(instructions ? { instructions } : {}) },
      { metadata: { userId }, ...(signal ? { signal } : {}) },
    );
    return (await this.ai.chatJson(req, SurveyResultSchema)).data.nodes;
  }

  async writeLesson(vars: LessonVars, userId: string, signal?: AbortSignal): Promise<LessonResult> {
    const req = buildRequest(lessonPrompt, vars, {
      metadata: { userId },
      ...(signal ? { signal } : {}),
    });
    return (await this.ai.chatJson(req, LessonResultSchema)).data;
  }
}
